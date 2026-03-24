/**
 * @fileoverview
 * 前端的前端 API 调用层模块，负责提供被页面和组件复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：fetchWorkbenchBootstrap、fetchBacktestRuns、fetchBacktestRunDetail、createBacktestRun、fetchDatabaseOverview、fetchDatabaseTableDetail、fetchDatabaseTableCount、fetchDatabaseRows。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 封装对后端 HTTP 接口的调用。
 * - 统一处理请求日志、错误和返回值结构。
 */

import type { BacktestRunDetail, BacktestRunItem, BacktestRunRequest, WorkbenchBootstrap } from "@contracts/workbench";
import type {
  ApiResponse,
  DatabaseDeleteRowsPayload,
  DatabaseExecuteSqlResult,
  DatabaseOverview,
  DatabaseQueryParams,
  DatabaseQueryResult,
  DatabaseRowMutationPayload,
  DatabaseTableCount,
  DatabaseTableDetail,
  DatabaseUpdateRowPayload,
} from "@contracts/database";
import {
  createRequestLogContext,
  logWebRequestError,
  logWebRequestStart,
  logWebRequestSuccess,
  RequestLogError,
  summarizeLogValue,
} from "@/lib/debug-log";

async function runLoggedRequest<T>(
  input: RequestInfo,
  init: RequestInit | undefined,
  resolver: (response: Response) => Promise<{ value: T; response_summary?: unknown }>,
): Promise<T> {
  const request_context = createRequestLogContext(input, init);
  logWebRequestStart(request_context);
  try {
    const response = await fetch(input, init);
    const result = await resolver(response);
    logWebRequestSuccess(request_context, response.status, result.response_summary ?? result.value);
    return result.value;
  } catch (error) {
    logWebRequestError(request_context, error);
    throw error;
  }
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  return runLoggedRequest(input, init, async (response) => {
    if (!response.ok) {
      const message = await response.text();
      throw new RequestLogError(message || `Request failed with ${response.status}`, {
        response_status: response.status,
        response_summary: summarizeLogValue(message),
      });
    }
    const payload = (await response.json()) as T;
    return {
      value: payload,
      response_summary: payload,
    };
  });
}

async function requestApiDatum<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  return runLoggedRequest(input, init, async (response) => {
    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok) {
      throw new RequestLogError(payload?.message || `Request failed with ${response.status}`, {
        response_status: response.status,
        response_summary: payload,
      });
    }
    if (payload.status !== "success") {
      throw new RequestLogError(payload.message || "操作失败", {
        response_status: response.status,
        response_summary: payload,
      });
    }
    return {
      value: payload.datum,
      response_summary: payload,
    };
  });
}

export function fetchWorkbenchBootstrap() {
  return requestJson<WorkbenchBootstrap>("/api/workbench/query");
}

export function fetchBacktestRuns() {
  return requestJson<{ items: BacktestRunItem[] }>("/api/backtests/query");
}

export function fetchBacktestRunDetail(runId: string) {
  const params = new URLSearchParams({ run_id: runId });
  return requestJson<BacktestRunDetail>(`/api/backtests/detail/query?${params.toString()}`);
}

export function createBacktestRun(payload: BacktestRunRequest) {
  return requestJson<BacktestRunDetail>("/api/backtests/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchDatabaseOverview() {
  return requestApiDatum<DatabaseOverview>("/api/database/query");
}

export function fetchDatabaseTableDetail(tableName: string) {
  const params = new URLSearchParams({ table_name: tableName });
  return requestApiDatum<DatabaseTableDetail>(`/api/database/table/query?${params.toString()}`);
}

export function fetchDatabaseTableCount(tableName: string) {
  const params = new URLSearchParams({ table_name: tableName });
  return requestApiDatum<DatabaseTableCount>(`/api/database/table/count/query?${params.toString()}`);
}

export function fetchDatabaseRows(params: DatabaseQueryParams) {
  const search = new URLSearchParams({
    table_name: params.table_name,
    current_page: String(params.current_page),
    page_size: String(params.page_size),
    keyword: params.keyword || "",
    search_field: params.search_field || "__all__",
    sort_field: params.sort_field || "",
    sort_direction: params.sort_direction || "desc",
    filters: JSON.stringify(params.filters || []),
  });
  return requestApiDatum<DatabaseQueryResult>(`/api/database/data/query?${search.toString()}`);
}

export function executeDatabaseSql(sql: string) {
  return requestApiDatum<DatabaseExecuteSqlResult>("/api/database/sql/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
}

export function createDatabaseRow(payload: DatabaseRowMutationPayload) {
  return requestApiDatum<{ affected_rows: number; last_row_id: number | null }>("/api/database/row/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function updateDatabaseRow(payload: DatabaseUpdateRowPayload) {
  return requestApiDatum<{ affected_rows: number }>("/api/database/row/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function deleteDatabaseRows(payload: DatabaseDeleteRowsPayload) {
  return requestApiDatum<{ affected_rows: number }>("/api/database/row/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
