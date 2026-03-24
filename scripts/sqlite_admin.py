#!/usr/bin/env python3
"""
@fileoverview
SQLite 管理脚本，负责数据库概览、表结构、分页浏览、受限 SQL 和行级增删改。

主要职责：
- 对外暴露：load_payload、to_json、error、connect、quote_identifier、fetch_table_list、require_table、get_columns。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 直接基于 Python 标准库 `sqlite3` 操作本地数据库。
- 封装表列表、表结构、分页查询、SQL 执行和行级写入等动作。
- 作为前端数据库管理页和后端数据库服务之间的底层桥接。

使用方式：
- 命令行入口：`./.venv/bin/python scripts/sqlite_admin.py ...`。
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from typing import Any


MAX_QUERY_ROWS = 200
MAX_PAGE_SIZE = 100
ALLOWED_SQL_PREFIXES = {"select", "with", "insert", "update", "delete"}
BANNED_SQL_PATTERNS = [
    r"\battach\b",
    r"\bdetach\b",
    r"\bdrop\b",
    r"\balter\b",
    r"\bvacc?uum\b",
    r"\breindex\b",
    r"\btruncate\b",
    r"\bcreate\s+trigger\b",
    r"\bcreate\s+view\b",
    r"\bcreate\s+virtual\s+table\b",
    r"\bpragma\b",
    r"\bbegin\b",
    r"\bcommit\b",
    r"\brollback\b",
    r"\bsavepoint\b",
    r"\brelease\b",
]


def load_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def to_json(data: Any) -> None:
    sys.stdout.write(json.dumps(data, ensure_ascii=False))


def error(message: str) -> None:
    raise ValueError(message)


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def fetch_table_list(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    cursor = conn.execute(
        """
        SELECT name, ncol, wr
        FROM pragma_table_list
        WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    )
    return cursor.fetchall()


def require_table(conn: sqlite3.Connection, table_name: str) -> sqlite3.Row:
    for row in fetch_table_list(conn):
        if row["name"] == table_name:
            return row
    error(f"数据表不存在: {table_name}")


def get_columns(conn: sqlite3.Connection, table_name: str) -> list[sqlite3.Row]:
    return conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})").fetchall()


def get_row_identity(conn: sqlite3.Connection, table_name: str) -> dict[str, Any]:
    table_meta = require_table(conn, table_name)
    columns = get_columns(conn, table_name)
    if table_meta["wr"] == 0:
        return {"mode": "rowid", "field": "__rowid__"}
    primary_keys = [column["name"] for column in columns if column["pk"]]
    if primary_keys:
        return {"mode": "primary_key", "fields": primary_keys}
    return {"mode": "read_only", "reason": "当前表没有 rowid 或主键，无法安全定位单行记录。"}


def get_table_summary(conn: sqlite3.Connection, table_name: str, column_count: int) -> dict[str, Any]:
    return {
        "name": table_name,
        "record_count": None,
        "column_count": column_count,
        "row_identity": get_row_identity(conn, table_name),
    }


def build_table_count(conn: sqlite3.Connection, table_name: str) -> dict[str, Any]:
    require_table(conn, table_name)
    record_count = conn.execute(
        f"SELECT COUNT(*) AS total FROM {quote_identifier(table_name)}"
    ).fetchone()["total"]
    return {
        "table_name": table_name,
        "record_count": record_count,
    }


def build_overview(conn: sqlite3.Connection, db_path: str) -> dict[str, Any]:
    version = conn.execute("SELECT sqlite_version() AS version").fetchone()["version"]
    tables = []
    for row in fetch_table_list(conn):
        tables.append(get_table_summary(conn, row["name"], row["ncol"]))
    return {
        "database_path": db_path,
        "database_size": os.path.getsize(db_path),
        "sqlite_version": version,
        "table_count": len(tables),
        "tables": tables,
    }


def build_table_detail(conn: sqlite3.Connection, table_name: str) -> dict[str, Any]:
    require_table(conn, table_name)
    columns = [
        {
            "cid": row["cid"],
            "name": row["name"],
            "type": row["type"],
            "notnull": bool(row["notnull"]),
            "default_value": row["dflt_value"],
            "primary_key_order": row["pk"],
        }
        for row in get_columns(conn, table_name)
    ]
    index_rows = conn.execute(f"PRAGMA index_list({quote_identifier(table_name)})").fetchall()
    indexes = []
    for index_row in index_rows:
        index_columns = conn.execute(f"PRAGMA index_info({quote_identifier(index_row['name'])})").fetchall()
        indexes.append(
            {
                "name": index_row["name"],
                "unique": bool(index_row["unique"]),
                "origin": index_row["origin"],
                "partial": bool(index_row["partial"]),
                "columns": [item["name"] for item in index_columns],
            }
        )
    create_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    row_identity = get_row_identity(conn, table_name)
    return {
        "table_name": table_name,
        "row_identity": row_identity,
        "writable": row_identity["mode"] != "read_only",
        "create_sql": create_row["sql"] if create_row and create_row["sql"] else "",
        "columns": columns,
        "indexes": indexes,
    }


def require_column(conn: sqlite3.Connection, table_name: str, column_name: str) -> None:
    columns = {row["name"] for row in get_columns(conn, table_name)}
    if column_name not in columns:
        error(f"字段不存在: {column_name}")


def normalize_page_size(page_size: Any) -> int:
    value = int(page_size or 20)
    return max(1, min(MAX_PAGE_SIZE, value))


def normalize_page(page: Any) -> int:
    return max(1, int(page or 1))


def build_filter_clause(filters: list[dict[str, Any]], table_name: str, conn: sqlite3.Connection) -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for item in filters:
        field = str(item.get("field") or "").strip()
        operator = str(item.get("operator") or "").strip()
        value = item.get("value", "")
        require_column(conn, table_name, field)
        quoted = quote_identifier(field)
        if operator == "contains":
            clauses.append(f"CAST({quoted} AS TEXT) LIKE ?")
            params.append(f"%{value}%")
        elif operator == "equals":
            clauses.append(f"CAST({quoted} AS TEXT) = ?")
            params.append(str(value))
        elif operator == "starts_with":
            clauses.append(f"CAST({quoted} AS TEXT) LIKE ?")
            params.append(f"{value}%")
        elif operator == "ends_with":
            clauses.append(f"CAST({quoted} AS TEXT) LIKE ?")
            params.append(f"%{value}")
        elif operator in {"gt", "gte", "lt", "lte"}:
            compare_map = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
            clauses.append(f"{quoted} {compare_map[operator]} ?")
            params.append(value)
        else:
            error(f"不支持的筛选操作: {operator}")
    return clauses, params


def build_search_clause(
    conn: sqlite3.Connection,
    table_name: str,
    keyword: str,
    search_field: str | None,
) -> tuple[str, list[Any]]:
    if not keyword:
        return "", []
    if search_field and search_field != "__all__":
        require_column(conn, table_name, search_field)
        return f"CAST({quote_identifier(search_field)} AS TEXT) LIKE ?", [f"%{keyword}%"]
    columns = [row["name"] for row in get_columns(conn, table_name)]
    if not columns:
        return "", []
    clause = " OR ".join([f"CAST({quote_identifier(column)} AS TEXT) LIKE ?" for column in columns])
    return f"({clause})", [f"%{keyword}%"] * len(columns)


def build_query_result(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    table_name = str(payload.get("table_name") or "").strip()
    require_table(conn, table_name)

    current_page = normalize_page(payload.get("current_page"))
    page_size = normalize_page_size(payload.get("page_size"))
    sort_field = str(payload.get("sort_field") or "").strip()
    sort_direction = str(payload.get("sort_direction") or "desc").lower()
    search_field = str(payload.get("search_field") or "__all__").strip()
    keyword = str(payload.get("keyword") or "").strip()
    filters = payload.get("filters") or []

    where_clauses: list[str] = []
    params: list[Any] = []

    search_clause, search_params = build_search_clause(conn, table_name, keyword, search_field)
    if search_clause:
        where_clauses.append(search_clause)
        params.extend(search_params)

    filter_clauses, filter_params = build_filter_clause(filters, table_name, conn)
    where_clauses.extend(filter_clauses)
    params.extend(filter_params)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    order_sql = ""
    if sort_field:
        require_column(conn, table_name, sort_field)
        normalized_direction = "DESC" if sort_direction == "desc" else "ASC"
        order_sql = f"ORDER BY {quote_identifier(sort_field)} {normalized_direction}"

    offset = (current_page - 1) * page_size
    row_identity = get_row_identity(conn, table_name)
    identity_select = 'rowid AS "__rowid__", ' if row_identity["mode"] == "rowid" else ""
    total = conn.execute(
        f"SELECT COUNT(*) AS total FROM {quote_identifier(table_name)} {where_sql}",
        params,
    ).fetchone()["total"]
    cursor = conn.execute(
        f"""
        SELECT {identity_select}*
        FROM {quote_identifier(table_name)}
        {where_sql}
        {order_sql}
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    )
    rows = [dict(row) for row in cursor.fetchall()]
    columns = list(rows[0].keys()) if rows else ([row["name"] for row in get_columns(conn, table_name)])
    if row_identity["mode"] == "rowid" and "__rowid__" not in columns:
        columns = ["__rowid__", *columns]
    return {
        "table_name": table_name,
        "columns": columns,
        "row_identity": row_identity,
        "list": rows,
        "pagination": {
            "current_page": current_page,
            "page_size": page_size,
            "total": total,
        },
    }


def clean_sql(sql: str) -> str:
    stripped = sql.strip()
    if not stripped:
        error("SQL 不能为空。")
    if stripped.count(";") > 1 or (";" in stripped[:-1]):
        error("仅允许执行单条 SQL 语句。")
    return stripped.rstrip(";").strip()


def validate_sql(sql: str) -> str:
    normalized = clean_sql(sql)
    lowered = normalized.lower()
    for pattern in BANNED_SQL_PATTERNS:
        if re.search(pattern, lowered):
            error("SQL 包含受限操作，已拒绝执行。")
    prefix_match = re.match(r"^\s*([a-z]+)", lowered)
    if not prefix_match:
        error("无法识别 SQL 类型。")
    statement_type = prefix_match.group(1)
    if statement_type not in ALLOWED_SQL_PREFIXES:
        error(f"当前仅允许执行 {', '.join(sorted(ALLOWED_SQL_PREFIXES))} 语句。")
    return statement_type


def execute_sql(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    sql = str(payload.get("sql") or "")
    statement_type = validate_sql(sql)
    cursor = conn.execute(clean_sql(sql))
    if cursor.description is None:
        conn.commit()
        return {
            "statement_type": statement_type,
            "columns": [],
            "list": [],
            "row_count": 0,
            "affected_rows": cursor.rowcount if cursor.rowcount != -1 else 0,
            "truncated": False,
        }

    rows = cursor.fetchmany(MAX_QUERY_ROWS + 1)
    truncated = len(rows) > MAX_QUERY_ROWS
    display_rows = rows[:MAX_QUERY_ROWS]
    columns = [item[0] for item in cursor.description] if cursor.description else []
    return {
        "statement_type": statement_type,
        "columns": columns,
        "list": [dict(row) if isinstance(row, sqlite3.Row) else row for row in display_rows],
        "row_count": len(display_rows),
        "affected_rows": cursor.rowcount if cursor.rowcount != -1 else 0,
        "truncated": truncated,
    }


def filter_mutation_values(conn: sqlite3.Connection, table_name: str, values: dict[str, Any]) -> tuple[list[str], list[Any]]:
    columns = {row["name"] for row in get_columns(conn, table_name)}
    filtered_keys = [key for key in values.keys() if key in columns]
    if not filtered_keys:
        error("没有可写入的字段。")
    return filtered_keys, [values[key] for key in filtered_keys]


def build_identity_clause(row_identity: dict[str, Any], identity_value: dict[str, Any]) -> tuple[str, list[Any]]:
    if row_identity["mode"] == "rowid":
        if "__rowid__" not in identity_value:
            error("缺少 __rowid__，无法定位记录。")
        return 'rowid = ?', [identity_value["__rowid__"]]
    if row_identity["mode"] == "primary_key":
        clauses = []
        params = []
        for field in row_identity["fields"]:
            if field not in identity_value:
                error(f"缺少主键字段: {field}")
            clauses.append(f"{quote_identifier(field)} = ?")
            params.append(identity_value[field])
        return " AND ".join(clauses), params
    error(row_identity["reason"])


def create_row(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    table_name = str(payload.get("table_name") or "").strip()
    require_table(conn, table_name)
    values = payload.get("values") or {}
    fields, params = filter_mutation_values(conn, table_name, values)
    columns_sql = ", ".join(quote_identifier(field) for field in fields)
    placeholders = ", ".join(["?"] * len(fields))
    cursor = conn.execute(
        f"INSERT INTO {quote_identifier(table_name)} ({columns_sql}) VALUES ({placeholders})",
        params,
    )
    conn.commit()
    return {
        "affected_rows": cursor.rowcount if cursor.rowcount != -1 else 1,
        "last_row_id": cursor.lastrowid,
    }


def update_row(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    table_name = str(payload.get("table_name") or "").strip()
    require_table(conn, table_name)
    row_identity = get_row_identity(conn, table_name)
    values = payload.get("values") or {}
    identity_value = payload.get("row_identity_value") or {}
    fields, params = filter_mutation_values(conn, table_name, values)
    set_sql = ", ".join(f"{quote_identifier(field)} = ?" for field in fields)
    where_sql, where_params = build_identity_clause(row_identity, identity_value)
    cursor = conn.execute(
        f"UPDATE {quote_identifier(table_name)} SET {set_sql} WHERE {where_sql}",
        [*params, *where_params],
    )
    conn.commit()
    return {
        "affected_rows": cursor.rowcount if cursor.rowcount != -1 else 0,
    }


def delete_rows(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    table_name = str(payload.get("table_name") or "").strip()
    require_table(conn, table_name)
    row_identity = get_row_identity(conn, table_name)
    data = payload.get("data") or []
    if not data:
        error("删除请求不能为空。")
    affected_rows = 0
    for identity_value in data:
        where_sql, where_params = build_identity_clause(row_identity, identity_value)
        cursor = conn.execute(
            f"DELETE FROM {quote_identifier(table_name)} WHERE {where_sql}",
            where_params,
        )
        affected_rows += cursor.rowcount if cursor.rowcount != -1 else 0
    conn.commit()
    return {
        "affected_rows": affected_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--action", required=True)
    args = parser.parse_args()

    payload = load_payload()
    conn = connect(args.db)
    try:
        if args.action == "overview":
            to_json(build_overview(conn, args.db))
        elif args.action == "table_count":
            to_json(build_table_count(conn, str(payload.get("table_name") or "")))
        elif args.action == "table_detail":
            to_json(build_table_detail(conn, str(payload.get("table_name") or "")))
        elif args.action == "query_rows":
            to_json(build_query_result(conn, payload))
        elif args.action == "execute_sql":
            to_json(execute_sql(conn, payload))
        elif args.action == "create_row":
            to_json(create_row(conn, payload))
        elif args.action == "update_row":
            to_json(update_row(conn, payload))
        elif args.action == "delete_rows":
            to_json(delete_rows(conn, payload))
        else:
            error(f"未知动作: {args.action}")
        return 0
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(str(exc))
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
