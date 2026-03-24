/**
 * @fileoverview
 * 共享契约层的数据库共享契约定义模块，负责定义前后端共享的类型约定和数据结构。
 *
 * 主要职责：
 * - 对外暴露：模块级常量、类型或默认导出。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 把页面、服务端和共享包共用的接口结构抽到同一处维护。
 * - 降低前后端对字段和返回格式理解不一致的风险。
 */

export type ApiResponse<T> = {
  status: "success" | "error";
  message: string;
  datum: T;
};

export type DatabaseRowIdentity =
  | {
      mode: "rowid";
      field: "__rowid__";
    }
  | {
      mode: "primary_key";
      fields: string[];
    }
  | {
      mode: "read_only";
      reason: string;
    };

export type DatabaseTableSummary = {
  name: string;
  record_count: number | null;
  column_count: number;
  row_identity: DatabaseRowIdentity;
};

export type DatabaseOverview = {
  database_path: string;
  database_size: number;
  sqlite_version: string;
  table_count: number;
  tables: DatabaseTableSummary[];
};

export type DatabaseTableCount = {
  table_name: string;
  record_count: number;
};

export type DatabaseColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  default_value: string | null;
  primary_key_order: number;
};

export type DatabaseIndexInfo = {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: string[];
};

export type DatabaseTableDetail = {
  table_name: string;
  row_identity: DatabaseRowIdentity;
  writable: boolean;
  create_sql: string;
  columns: DatabaseColumnInfo[];
  indexes: DatabaseIndexInfo[];
};

export type DatabaseQueryFilterOperator =
  | "contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export type DatabaseQueryFilter = {
  field: string;
  operator: DatabaseQueryFilterOperator;
  value: string;
};

export type DatabaseQueryParams = {
  table_name: string;
  current_page: number;
  page_size: number;
  keyword?: string;
  search_field?: string;
  sort_field?: string;
  sort_direction?: "asc" | "desc";
  filters?: DatabaseQueryFilter[];
};

export type DatabaseQueryResult = {
  table_name: string;
  columns: string[];
  row_identity: DatabaseRowIdentity;
  list: Record<string, unknown>[];
  pagination: {
    current_page: number;
    page_size: number;
    total: number;
  };
};

export type DatabaseExecuteSqlResult = {
  statement_type: "select" | "with" | "insert" | "update" | "delete";
  columns: string[];
  list: Record<string, unknown>[];
  row_count: number;
  affected_rows: number;
  truncated: boolean;
};

export type DatabaseRowMutationPayload = {
  table_name: string;
  values: Record<string, unknown>;
};

export type DatabaseUpdateRowPayload = {
  table_name: string;
  row_identity_value: Record<string, unknown>;
  values: Record<string, unknown>;
};

export type DatabaseDeleteRowsPayload = {
  table_name: string;
  data: Record<string, unknown>[];
};
