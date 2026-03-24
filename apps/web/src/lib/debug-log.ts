/**
 * @fileoverview
 * 前端的前端调试日志工具模块，负责提供被页面和组件复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：summarizeLogValue、createRequestLogContext、logWebRequestStart、logWebRequestSuccess、logWebRequestError、formatRouteTarget、logWebRouteChange、RequestLogError。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 封装前端开发期日志输出。
 * - 对长对象和请求上下文做摘要化，避免控制台刷屏。
 */

const MAX_TEXT_LENGTH = 240;
const MAX_OBJECT_KEYS = 8;
const MAX_ARRAY_ITEMS = 4;
const MAX_SUMMARY_DEPTH = 2;

let request_sequence = 0;

function truncateText(text: string, max_length = MAX_TEXT_LENGTH) {
  if (text.length <= max_length) {
    return text;
  }
  return `${text.slice(0, max_length)}...(${text.length - max_length} chars omitted)`;
}

export function summarizeLogValue(value: unknown, depth = 0): unknown {
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
    const preview = value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeLogValue(item, depth + 1));
    return {
      type: "array",
      length: value.length,
      preview,
      omitted: Math.max(value.length - preview.length, 0),
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    const preview: Record<string, unknown> = {};
    for (const [key, entry_value] of entries.slice(0, MAX_OBJECT_KEYS)) {
      preview[key] = summarizeLogValue(entry_value, depth + 1);
    }
    const omitted = Math.max(entries.length - Object.keys(preview).length, 0);
    if (omitted > 0) {
      preview.__omitted_keys = omitted;
    }
    return preview;
  }

  return String(value);
}

function parseRequestBody(body: BodyInit | null | undefined) {
  if (!body) {
    return undefined;
  }

  if (typeof body === "string") {
    try {
      return summarizeLogValue(JSON.parse(body));
    } catch {
      return truncateText(body);
    }
  }

  if (body instanceof URLSearchParams) {
    return summarizeLogValue(Object.fromEntries(body.entries()));
  }

  if (body instanceof FormData) {
    return summarizeLogValue(Array.from(body.entries()).slice(0, MAX_ARRAY_ITEMS));
  }

  return truncateText(String(body));
}

function getRequestMethod(init?: RequestInit) {
  return init?.method?.toUpperCase() || "GET";
}

function resolveRequestUrl(input: RequestInfo) {
  const raw_url = typeof input === "string" ? input : input.url;
  return new URL(raw_url, window.location.origin);
}

function getCallerLabel() {
  const stack = new Error().stack || "";
  const line = stack
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item
      && !item.includes("getCallerLabel")
      && !item.includes("createRequestLogContext")
      && !item.includes("runLoggedRequest")
      && !item.includes("requestJson")
      && !item.includes("requestApiDatum"));
  return line ? line.replace(/^at\s+/, "") : "unknown";
}

function nextRequestId() {
  request_sequence += 1;
  return `web-${Date.now()}-${request_sequence}`;
}

export class RequestLogError extends Error {
  response_status?: number;
  response_summary?: unknown;

  constructor(message: string, options?: { response_status?: number; response_summary?: unknown }) {
    super(message);
    this.name = "RequestLogError";
    this.response_status = options?.response_status;
    this.response_summary = options?.response_summary;
  }
}

export function createRequestLogContext(input: RequestInfo, init?: RequestInit) {
  const request_url = resolveRequestUrl(input);
  return {
    request_id: nextRequestId(),
    started_at: new Date().toISOString(),
    started_ms: performance.now(),
    method: getRequestMethod(init),
    url: request_url.toString(),
    pathname: request_url.pathname,
    query: summarizeLogValue(Object.fromEntries(request_url.searchParams.entries())),
    body: parseRequestBody(init?.body),
    caller: getCallerLabel(),
  };
}

export function logWebRequestStart(context: ReturnType<typeof createRequestLogContext>) {
  console.log(`[web][request][${context.request_id}]`, {
    request_id: context.request_id,
    requested_at: context.started_at,
    method: context.method,
    pathname: context.pathname,
    url: context.url,
    caller: context.caller,
    query: context.query,
    body: context.body,
  });
}

export function logWebRequestSuccess(
  context: ReturnType<typeof createRequestLogContext>,
  response_status: number,
  response_value: unknown,
) {
  console.log(`[web][response][${context.request_id}]`, {
    request_id: context.request_id,
    responded_at: new Date().toISOString(),
    duration_ms: Number((performance.now() - context.started_ms).toFixed(1)),
    method: context.method,
    pathname: context.pathname,
    response_status,
    response_summary: summarizeLogValue(response_value),
  });
}

export function logWebRequestError(context: ReturnType<typeof createRequestLogContext>, error: unknown) {
  const request_error = error instanceof RequestLogError ? error : null;
  console.error(`[web][error][${context.request_id}]`, {
    request_id: context.request_id,
    responded_at: new Date().toISOString(),
    duration_ms: Number((performance.now() - context.started_ms).toFixed(1)),
    method: context.method,
    pathname: context.pathname,
    message: error instanceof Error ? error.message : String(error),
    response_status: request_error?.response_status,
    response_summary: request_error?.response_summary,
  });
}

export function formatRouteTarget(location: { pathname: string; search?: string; hash?: string }) {
  return `${location.pathname}${location.search || ""}${location.hash || ""}`;
}

export function logWebRouteChange(from_route: string, to_route: string, source = "") {
  console.log("[web][route]", {
    changed_at: new Date().toISOString(),
    from_route,
    to_route,
    source: source || "history",
  });
}
