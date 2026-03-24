/**
 * @fileoverview
 * 前端的SQL 高亮工具模块，负责提供被页面和组件复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：highlightSql、escapeHtml。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 负责 SQL 文本的转义和高亮展示。
 * - 服务数据库管理页中的 SQL 相关 UI。
 */

const SQL_KEYWORDS = [
  "select",
  "from",
  "where",
  "order",
  "by",
  "group",
  "having",
  "limit",
  "offset",
  "insert",
  "into",
  "values",
  "update",
  "set",
  "delete",
  "with",
  "as",
  "and",
  "or",
  "not",
  "null",
  "is",
  "in",
  "like",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "on",
  "asc",
  "desc",
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function highlightSql(value: string) {
  if (!value) {
    return "";
  }

  let html = escapeHtml(value);
  html = html.replace(/(--.*)$/gm, '<span class="sql-token sql-token--comment">$1</span>');
  html = html.replace(/('[^']*')/g, '<span class="sql-token sql-token--string">$1</span>');
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sql-token sql-token--number">$1</span>');

  for (const keyword of SQL_KEYWORDS) {
    const regex = new RegExp(`\\b(${keyword})\\b`, "gi");
    html = html.replace(regex, '<span class="sql-token sql-token--keyword">$1</span>');
  }

  return html;
}
