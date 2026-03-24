/**
 * @fileoverview
 * 前端的前端路由与 query 工具模块，负责提供被页面和组件复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：buildQueryString、mergeQueryString、APP_ROUTES。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 集中维护 hash 路由和 query 组装规则。
 * - 为页面间跳转和 URL 状态同步提供统一工具。
 */

export const APP_ROUTES = {
  workbench: "/workbench",
  backtest_detail: "/backtests/detail",
  database: "/database",
} as const;

type QueryValue = string | number | undefined | null;

export function buildQueryString(params: Record<string, QueryValue>) {
  const search_params = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }
    search_params.set(key, String(value));
  }
  const query = search_params.toString();
  return query ? `?${query}` : "";
}

export function mergeQueryString(current_search: string, patch: Record<string, QueryValue>) {
  const search_params = new URLSearchParams(current_search);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") {
      search_params.delete(key);
      continue;
    }
    search_params.set(key, String(value));
  }
  const query = search_params.toString();
  return query ? `?${query}` : "";
}
