/**
 * @fileoverview
 * Express 后端的请求日志工具模块，负责为上层业务提供可复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：createRequestLogger、truncateText、summarizeValue、formatHeaderValue、searchParamsToObject、toBuffer、isTextContentType、summarizeCapturedResponse。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装文件系统、Python 子进程、响应格式、请求日志或静态资源解析等细节。
 * - 被 controller、service、middleware 或 app 层复用。
 */

import { randomUUID } from "node:crypto";

const MAX_STRING_LENGTH = 280;
const MAX_CAPTURE_BYTES = 1536;
const MAX_OBJECT_KEYS = 8;
const MAX_ARRAY_ITEMS = 4;
const MAX_SUMMARY_DEPTH = 2;

function truncateText(text, max_length = MAX_STRING_LENGTH) {
  if (typeof text !== "string") {
    return text;
  }
  if (text.length <= max_length) {
    return text;
  }
  return `${text.slice(0, max_length)}...(${text.length - max_length} chars omitted)`;
}

function summarizeValue(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return truncateText(value);
  }

  if (depth >= MAX_SUMMARY_DEPTH) {
    if (Array.isArray(value)) {
      return `[array:${value.length}]`;
    }
    return "[object]";
  }

  if (Array.isArray(value)) {
    const preview = value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1));
    return {
      type: "array",
      length: value.length,
      preview,
      omitted: Math.max(value.length - preview.length, 0),
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    const preview = {};
    for (const [key, entry_value] of entries.slice(0, MAX_OBJECT_KEYS)) {
      preview[key] = summarizeValue(entry_value, depth + 1);
    }
    const omitted = Math.max(entries.length - Object.keys(preview).length, 0);
    if (omitted > 0) {
      preview.__omitted_keys = omitted;
    }
    return preview;
  }

  return String(value);
}

function formatHeaderValue(value) {
  if (Array.isArray(value)) {
    return truncateText(value.join(", "));
  }
  if (typeof value === "string") {
    return truncateText(value);
  }
  return "";
}

function searchParamsToObject(search_params) {
  const params = {};
  for (const [key, value] of search_params.entries()) {
    params[key] = summarizeValue(value);
  }
  return params;
}

function toBuffer(chunk, encoding) {
  if (chunk == null) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf-8");
  }
  return Buffer.from(String(chunk));
}

function isTextContentType(content_type) {
  return content_type.includes("application/json")
    || content_type.startsWith("text/")
    || content_type.includes("application/javascript")
    || content_type.includes("application/xml")
    || content_type.includes("application/xhtml+xml");
}

function summarizeCapturedResponse(chunks, total_bytes, content_type, truncated) {
  if (total_bytes === 0) {
    return null;
  }

  if (!isTextContentType(content_type)) {
    return {
      type: "binary",
      content_type,
      total_bytes,
      truncated,
    };
  }

  const sample_text = Buffer.concat(chunks).toString("utf-8");
  if (content_type.includes("application/json")) {
    try {
      return {
        type: "json",
        total_bytes,
        truncated,
        preview: summarizeValue(JSON.parse(sample_text)),
      };
    } catch {
      return {
        type: "json-text",
        total_bytes,
        truncated,
        preview: truncateText(sample_text),
      };
    }
  }

  return {
    type: "text",
    content_type,
    total_bytes,
    truncated,
    preview: truncateText(sample_text),
  };
}

function captureResponse(response, response_state) {
  const original_write = response.write.bind(response);
  const original_end = response.end.bind(response);

  response.write = function patchedWrite(chunk, encoding, callback) {
    const buffer = toBuffer(chunk, encoding);
    response_state.total_bytes += buffer.byteLength;
    if (response_state.sample_bytes < MAX_CAPTURE_BYTES && buffer.byteLength > 0) {
      const remaining = MAX_CAPTURE_BYTES - response_state.sample_bytes;
      const sample = buffer.subarray(0, remaining);
      response_state.sample_chunks.push(sample);
      response_state.sample_bytes += sample.byteLength;
      response_state.truncated = response_state.truncated || sample.byteLength < buffer.byteLength;
    } else if (buffer.byteLength > 0) {
      response_state.truncated = true;
    }
    return original_write(chunk, encoding, callback);
  };

  response.end = function patchedEnd(chunk, encoding, callback) {
    if (chunk != null) {
      const buffer = toBuffer(chunk, encoding);
      response_state.total_bytes += buffer.byteLength;
      if (response_state.sample_bytes < MAX_CAPTURE_BYTES && buffer.byteLength > 0) {
        const remaining = MAX_CAPTURE_BYTES - response_state.sample_bytes;
        const sample = buffer.subarray(0, remaining);
        response_state.sample_chunks.push(sample);
        response_state.sample_bytes += sample.byteLength;
        response_state.truncated = response_state.truncated || sample.byteLength < buffer.byteLength;
      } else if (buffer.byteLength > 0) {
        response_state.truncated = true;
      }
    }
    return original_end(chunk, encoding, callback);
  };
}

export function createRequestLogger(request, response, url) {
  const request_id = randomUUID().slice(0, 8);
  const requested_at = new Date().toISOString();
  const started_ms = Date.now();
  const requester = {
    remote_address: request.socket?.remoteAddress || "",
    forwarded_for: formatHeaderValue(request.headers["x-forwarded-for"]),
    referer: formatHeaderValue(request.headers.referer),
    origin: formatHeaderValue(request.headers.origin),
    user_agent: formatHeaderValue(request.headers["user-agent"]),
  };
  let request_body;
  const response_state = {
    total_bytes: 0,
    sample_bytes: 0,
    sample_chunks: [],
    truncated: false,
  };

  captureResponse(response, response_state);

  response.on("finish", () => {
    const responded_at = new Date().toISOString();
    const duration_ms = Date.now() - started_ms;
    const content_type = formatHeaderValue(String(response.getHeader("Content-Type") || ""));
    console.log(`[server][response][${request_id}]`, {
      request_id,
      responded_at,
      duration_ms,
      method: request.method || "GET",
      pathname: url.pathname,
      status_code: response.statusCode,
      content_type,
      response_summary: summarizeCapturedResponse(
        response_state.sample_chunks,
        response_state.total_bytes,
        content_type,
        response_state.truncated,
      ),
    });
  });

  return {
    logStart() {
      console.log(`[server][request][${request_id}]`, {
        request_id,
        requested_at,
        method: request.method || "GET",
        pathname: url.pathname,
        full_url: url.toString(),
        query: searchParamsToObject(url.searchParams),
        requester,
      });
    },
    setRequestBody(value) {
      request_body = summarizeValue(value);
      console.log(`[server][request-body][${request_id}]`, {
        request_id,
        pathname: url.pathname,
        body: request_body,
      });
    },
    logError(error) {
      console.error(`[server][error][${request_id}]`, {
        request_id,
        pathname: url.pathname,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  };
}
