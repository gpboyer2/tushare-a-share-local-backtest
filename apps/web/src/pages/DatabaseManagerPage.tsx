/**
 * @fileoverview
 * React 的数据库管理页面，负责承载该路由对应的完整页面状态与交互。
 *
 * 主要职责：
 * - 对外暴露：DatabaseManagerPage、formatBytes、getIdentityValue、getIdentityKey、normalizeInputValue、createEmptyForm、parsePositiveNumber、parseSortDirection。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 根据 URL query、接口结果和本地状态渲染页面。
 * - 把页面级操作拆给 API 工具和子组件。
 */

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  NativeSelect,
  Pagination,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  DatabaseColumnInfo,
  DatabaseExecuteSqlResult,
  DatabaseOverview,
  DatabaseQueryFilterOperator,
  DatabaseQueryResult,
  DatabaseRowIdentity,
  DatabaseTableDetail,
} from "@contracts/database";
import {
  createDatabaseRow,
  deleteDatabaseRows,
  executeDatabaseSql,
  fetchDatabaseOverview,
  fetchDatabaseRows,
  fetchDatabaseTableCount,
  fetchDatabaseTableDetail,
  updateDatabaseRow,
} from "@/lib/api";
import { APP_ROUTES, mergeQueryString } from "@/lib/routes";
import { highlightSql } from "@/lib/sql";

const DEFAULT_SQL = "SELECT * FROM stock_basic ORDER BY ts_code LIMIT 20";
const FILTER_OPTIONS: Array<{ value: DatabaseQueryFilterOperator; label: string }> = [
  { value: "contains", label: "包含" },
  { value: "equals", label: "等于" },
  { value: "starts_with", label: "开头为" },
  { value: "ends_with", label: "结尾为" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
];

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getIdentityValue(rowIdentity: DatabaseRowIdentity, row: Record<string, unknown>) {
  if (rowIdentity.mode === "rowid") {
    return { __rowid__: row.__rowid__ };
  }
  if (rowIdentity.mode === "primary_key") {
    const nextValue: Record<string, unknown> = {};
    for (const field of rowIdentity.fields) {
      nextValue[field] = row[field];
    }
    return nextValue;
  }
  return {};
}

function getIdentityKey(rowIdentity: DatabaseRowIdentity, row: Record<string, unknown>) {
  return JSON.stringify(getIdentityValue(rowIdentity, row));
}

function normalizeInputValue(column: DatabaseColumnInfo, rawValue: string) {
  if (rawValue === "") {
    return null;
  }
  const type = column.type.toLowerCase();
  if (type.includes("int")) {
    return Number.parseInt(rawValue, 10);
  }
  if (type.includes("real") || type.includes("floa") || type.includes("doub") || type.includes("numeric") || type.includes("dec")) {
    return Number(rawValue);
  }
  return rawValue;
}

function createEmptyForm(columns: DatabaseColumnInfo[]) {
  const nextForm: Record<string, string> = {};
  for (const column of columns) {
    nextForm[column.name] = "";
  }
  return nextForm;
}

function parsePositiveNumber(value: string | null, fallbackValue: number) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : fallbackValue;
}

function parseSortDirection(value: string | null) {
  return value === "asc" || value === "desc" ? value : "desc";
}

function parseFilterOperator(value: string | null): DatabaseQueryFilterOperator {
  return FILTER_OPTIONS.some((option) => option.value === value)
    ? (value as DatabaseQueryFilterOperator)
    : "contains";
}

function logDatabaseDebug(event: string, payload?: Record<string, unknown>) {
  console.debug("[database-debug]", event, payload ?? {});
}

export function DatabaseManagerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const route_query = new URLSearchParams(location.search);
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [tableDetail, setTableDetail] = useState<DatabaseTableDetail | null>(null);
  const [tableData, setTableData] = useState<DatabaseQueryResult | null>(null);
  const [selectedTable, setSelectedTable] = useState(route_query.get("table_name") || "");
  const [keyword, setKeyword] = useState(route_query.get("keyword") || "");
  const [searchField, setSearchField] = useState(route_query.get("search_field") || "__all__");
  const [filterField, setFilterField] = useState(route_query.get("filter_field") || "");
  const [filterOperator, setFilterOperator] = useState<DatabaseQueryFilterOperator>(parseFilterOperator(route_query.get("filter_operator")));
  const [filterValue, setFilterValue] = useState(route_query.get("filter_value") || "");
  const [sortField, setSortField] = useState(route_query.get("sort_field") || "");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(parseSortDirection(route_query.get("sort_direction")));
  const [currentPage, setCurrentPage] = useState(parsePositiveNumber(route_query.get("current_page"), 1));
  const [pageSize, setPageSize] = useState(parsePositiveNumber(route_query.get("page_size"), 20));
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [sqlText, setSqlText] = useState(DEFAULT_SQL);
  const [sqlResult, setSqlResult] = useState<DatabaseExecuteSqlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [viewingRow, setViewingRow] = useState<Record<string, unknown> | null>(null);
  const [centerTab, setCenterTab] = useState<"browse" | "sql">("browse");
  const [sideTab, setSideTab] = useState<"schema" | "form" | "json">("schema");
  const overview_count_request_id_ref = useRef(0);
  const table_request_id_ref = useRef(0);

  function updateRouteQuery(patch: Record<string, string | number | undefined>, replace = false) {
    navigate(
      {
        pathname: APP_ROUTES.database,
        search: mergeQueryString(location.search, patch),
      },
      {
        replace,
        state: { log_source: "DatabaseManagerPage:updateRouteQuery" },
      },
    );
  }

  function buildFilters(
    nextFilterField = filterField,
    nextFilterOperator = filterOperator,
    nextFilterValue = filterValue,
  ) {
    return nextFilterField && nextFilterValue
      ? [{ field: nextFilterField, operator: nextFilterOperator, value: nextFilterValue }]
      : [];
  }

  async function loadOverview() {
    const request_id = overview_count_request_id_ref.current + 1;
    overview_count_request_id_ref.current = request_id;
    try {
      setLoading(true);
      logDatabaseDebug("loadOverview:start", { selected_table: selectedTable });
      const result = await fetchDatabaseOverview();
      setOverview(result);
      logDatabaseDebug("loadOverview:success", { table_count: result.table_count });
      void hydrateOverviewTableCounts(result.tables, request_id);
      if (selectedTable && !result.tables.some((table) => table.name === selectedTable)) {
        setSelectedTable("");
        setTableDetail(null);
        setTableData(null);
        setViewingRow(null);
        setSideTab("schema");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function hydrateOverviewTableCounts(tables: DatabaseOverview["tables"], requestId: number) {
    for (const table of tables) {
      if (requestId !== overview_count_request_id_ref.current) {
        return;
      }
      try {
        const result = await fetchDatabaseTableCount(table.name);
        if (requestId !== overview_count_request_id_ref.current) {
          return;
        }
        setOverview((current) => {
          if (!current) {
            return current;
          }
          const has_table = current.tables.some((item) => item.name === result.table_name);
          if (!has_table) {
            return current;
          }
          return {
            ...current,
            tables: current.tables.map((item) =>
              item.name === result.table_name ? { ...item, record_count: result.record_count } : item,
            ),
          };
        });
        logDatabaseDebug("loadOverview:count-success", {
          table_name: result.table_name,
          record_count: result.record_count,
        });
      } catch (countError) {
        if (requestId !== overview_count_request_id_ref.current) {
          return;
        }
        logDatabaseDebug("loadOverview:count-error", {
          table_name: table.name,
          message: countError instanceof Error ? countError.message : String(countError),
        });
      }
    }
  }

  async function loadSelectedTable(
    tableName: string,
    nextPage = currentPage,
    nextSortField = sortField,
    nextSortDirection = sortDirection,
    options?: {
      keyword?: string;
      searchField?: string;
      filterField?: string;
      filterOperator?: DatabaseQueryFilterOperator;
      filterValue?: string;
    },
  ) {
    if (!tableName) {
      logDatabaseDebug("loadSelectedTable:skip-empty");
      setTableDetail(null);
      setTableData(null);
      setViewingRow(null);
      setSelectedKeys([]);
      return;
    }

    const request_id = table_request_id_ref.current + 1;
    table_request_id_ref.current = request_id;

    try {
      setTableLoading(true);
      setError("");
      logDatabaseDebug("loadSelectedTable:start", {
        table_name: tableName,
        current_page: nextPage,
        page_size: pageSize,
        sort_field: nextSortField,
        sort_direction: nextSortDirection,
      });
      const nextKeyword = options?.keyword ?? keyword;
      const nextSearchField = options?.searchField ?? searchField;
      const filters = buildFilters(
        options?.filterField ?? filterField,
        options?.filterOperator ?? filterOperator,
        options?.filterValue ?? filterValue,
      );
      const [detail, data] = await Promise.all([
        fetchDatabaseTableDetail(tableName),
        fetchDatabaseRows({
          table_name: tableName,
          current_page: nextPage,
          page_size: pageSize,
          keyword: nextKeyword,
          search_field: nextSearchField,
          sort_field: nextSortField,
          sort_direction: nextSortDirection,
          filters,
        }),
      ]);
      if (request_id !== table_request_id_ref.current) {
        return;
      }
      setTableDetail(detail);
      setTableData(data);
      setViewingRow(null);
      setSelectedKeys([]);
      setCenterTab("browse");
      logDatabaseDebug("loadSelectedTable:success", {
        table_name: tableName,
        row_count: data.list.length,
        total: data.pagination.total,
      });
      if (formMode === "create") {
        setFormValues(createEmptyForm(detail.columns));
      }
    } catch (loadError) {
      if (request_id !== table_request_id_ref.current) {
        return;
      }
      logDatabaseDebug("loadSelectedTable:error", {
        table_name: tableName,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (request_id === table_request_id_ref.current) {
        setTableLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!selectedTable) {
      return;
    }
    void loadSelectedTable(selectedTable, currentPage, sortField, sortDirection);
  }, [selectedTable, currentPage, pageSize]);

  function handleSelectTable(tableName: string) {
    logDatabaseDebug("handleSelectTable", { table_name: tableName });
    const switching_table = tableName !== selectedTable;
    if (switching_table) {
      setTableLoading(true);
      setTableDetail(null);
      setTableData(null);
      setSelectedKeys([]);
      setViewingRow(null);
      setError("");
      setMessage("");
    }
    setSelectedTable(tableName);
    setCurrentPage(1);
    setSortField("");
    setSortDirection("desc");
    setEditingKey("");
    setFormMode("create");
    setViewingRow(null);
    setSideTab("schema");
    setCenterTab("browse");
    updateRouteQuery({
      table_name: tableName,
      current_page: 1,
      sort_field: undefined,
      sort_direction: "desc",
    });
  }

  function handleApplyQuery() {
    setCurrentPage(1);
    updateRouteQuery({
      table_name: selectedTable,
      current_page: 1,
      page_size: pageSize,
      keyword,
      search_field: searchField,
      filter_field: filterField,
      filter_operator: filterOperator,
      filter_value: filterValue,
      sort_field: sortField,
      sort_direction: sortDirection,
    });
    void loadSelectedTable(selectedTable, 1, sortField, sortDirection);
  }

  function handleResetQuery() {
    setKeyword("");
    setSearchField("__all__");
    setFilterField("");
    setFilterOperator("contains");
    setFilterValue("");
    setCurrentPage(1);
    updateRouteQuery({
      keyword: undefined,
      search_field: "__all__",
      filter_field: undefined,
      filter_operator: "contains",
      filter_value: undefined,
      current_page: 1,
    });
    void loadSelectedTable(selectedTable, 1, sortField, sortDirection, {
      keyword: "",
      searchField: "__all__",
      filterField: "",
      filterOperator: "contains",
      filterValue: "",
    });
  }

  function handleSort(columnName: string) {
    const nextDirection = sortField === columnName && sortDirection === "asc" ? "desc" : "asc";
    setSortField(columnName);
    setSortDirection(nextDirection);
    setCurrentPage(1);
    updateRouteQuery({
      sort_field: columnName,
      sort_direction: nextDirection,
      current_page: 1,
    });
    void loadSelectedTable(selectedTable, 1, columnName, nextDirection);
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setCurrentPage(1);
    updateRouteQuery({
      page_size: nextPageSize,
      current_page: 1,
    });
  }

  function handlePageChange(nextPage: number) {
    setCurrentPage(nextPage);
    updateRouteQuery({
      current_page: nextPage,
    });
  }

  function handleToggleRow(row: Record<string, unknown>) {
    if (!tableData) {
      return;
    }
    const key = getIdentityKey(tableData.row_identity, row);
    setSelectedKeys((currentValue) => (
      currentValue.includes(key)
        ? currentValue.filter((item) => item !== key)
        : [...currentValue, key]
    ));
  }

  function handleSelectAllCurrentPage() {
    if (!tableData) {
      return;
    }
    const pageKeys = tableData.list.map((row) => getIdentityKey(tableData.row_identity, row));
    const allSelected = pageKeys.every((key) => selectedKeys.includes(key));
    setSelectedKeys(allSelected ? [] : pageKeys);
  }

  function handleEditRow(row: Record<string, unknown>) {
    if (!tableDetail || !tableData) {
      logDatabaseDebug("handleEditRow:blocked", {
        has_table_detail: Boolean(tableDetail),
        has_table_data: Boolean(tableData),
      });
      return;
    }
    const nextFormValues = createEmptyForm(tableDetail.columns);
    for (const column of tableDetail.columns) {
      const value = row[column.name];
      nextFormValues[column.name] = value == null ? "" : String(value);
    }
    setFormMode("edit");
    setEditingKey(getIdentityKey(tableData.row_identity, row));
    setFormValues(nextFormValues);
    setMessage(`已进入编辑模式：${selectedTable}。`);
    setError("");
    setSideTab("form");
    logDatabaseDebug("handleEditRow", {
      table_name: selectedTable,
      identity_key: getIdentityKey(tableData.row_identity, row),
    });
  }

  function handleViewRow(row: Record<string, unknown>) {
    setViewingRow(row);
    setMessage(`已查看 ${selectedTable} 的当前行 JSON。`);
    setError("");
    setSideTab("json");
    logDatabaseDebug("handleViewRow", {
      table_name: selectedTable,
      keys: Object.keys(row),
    });
  }

  function handleCreateRow() {
    if (!tableDetail) {
      logDatabaseDebug("handleCreateRow:blocked", { has_table_detail: false });
      return;
    }
    setFormMode("create");
    setEditingKey("");
    setFormValues(createEmptyForm(tableDetail.columns));
    setMessage(`已切换到新增模式：${selectedTable}。`);
    setError("");
    setSideTab("form");
    logDatabaseDebug("handleCreateRow", { table_name: selectedTable });
  }

  function getEditingIdentityValue() {
    if (!tableData) {
      return {};
    }
    const matchedRow = tableData.list.find((row) => getIdentityKey(tableData.row_identity, row) === editingKey);
    return matchedRow ? getIdentityValue(tableData.row_identity, matchedRow) : {};
  }

  async function handleSubmitForm() {
    if (!tableDetail || !selectedTable) {
      return;
    }
    try {
      setError("");
      setMessage("");
      const values: Record<string, unknown> = {};
      for (const column of tableDetail.columns) {
        values[column.name] = normalizeInputValue(column, formValues[column.name] ?? "");
      }
      if (formMode === "create") {
        await createDatabaseRow({
          table_name: selectedTable,
          values,
        });
        setMessage("新增记录成功。");
      } else {
        await updateDatabaseRow({
          table_name: selectedTable,
          row_identity_value: getEditingIdentityValue(),
          values,
        });
        setMessage("更新记录成功。");
      }
      await loadOverview();
      await loadSelectedTable(selectedTable, currentPage, sortField, sortDirection);
      handleCreateRow();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    }
  }

  async function handleDeleteSelected() {
    if (!tableData || !selectedKeys.length) {
      return;
    }
    try {
      setError("");
      setMessage("");
      const data = tableData.list
        .filter((row) => selectedKeys.includes(getIdentityKey(tableData.row_identity, row)))
        .map((row) => getIdentityValue(tableData.row_identity, row));
      await deleteDatabaseRows({
        table_name: selectedTable,
        data,
      });
      setMessage(`已删除 ${data.length} 条记录。`);
      setSelectedKeys([]);
      setViewingRow(null);
      await loadOverview();
      await loadSelectedTable(selectedTable, currentPage, sortField, sortDirection);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  }

  async function handleExecuteSql() {
    try {
      setSqlRunning(true);
      setError("");
      setMessage("");
      const result = await executeDatabaseSql(sqlText);
      setSqlResult(result);
      setMessage(result.statement_type === "select" || result.statement_type === "with" ? "SQL 查询成功。" : "SQL 执行成功。");
      await loadOverview();
      if (selectedTable) {
        await loadSelectedTable(selectedTable, currentPage, sortField, sortDirection);
      }
    } catch (sqlError) {
      setError(sqlError instanceof Error ? sqlError.message : String(sqlError));
    } finally {
      setSqlRunning(false);
    }
  }

  const totalPages = tableData ? Math.max(1, Math.ceil(tableData.pagination.total / tableData.pagination.page_size)) : 1;
  const sqlPreview = highlightSql(sqlText);
  const tableOptions = tableDetail?.columns.map((column) => ({ value: column.name, label: column.name })) ?? [];
  const searchableFieldOptions = [{ value: "__all__", label: "全部字段" }, ...tableOptions];
  const filterFieldOptions = [{ value: "", label: "无筛选字段" }, ...tableOptions];
  const pageSizeOptions = [
    { value: "20", label: "20 / 页" },
    { value: "50", label: "50 / 页" },
    { value: "100", label: "100 / 页" },
  ];

  useEffect(() => {
    logDatabaseDebug("state:selectedTable", { table_name: selectedTable });
  }, [selectedTable]);

  useEffect(() => {
    logDatabaseDebug("state:viewingRow", {
      active: Boolean(viewingRow),
      key_count: viewingRow ? Object.keys(viewingRow).length : 0,
    });
  }, [viewingRow]);

  useEffect(() => {
    logDatabaseDebug("state:formMode", {
      form_mode: formMode,
      editing_key: editingKey,
    });
  }, [formMode, editingKey]);

  useEffect(() => {
    logDatabaseDebug("state:tabs", {
      center_tab: centerTab,
      side_tab: sideTab,
    });
  }, [centerTab, sideTab]);

  return (
    <Stack gap="sm">
      <Paper withBorder radius="lg" p="sm">
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Title order={4}>数据库概览</Title>
              <Text size="xs" c="dimmed">固定连接项目本地 SQLite 缓存库 data_cache.db</Text>
            </div>
            <Button size="compact-xs" variant="subtle" color="orange" onClick={() => void loadOverview()}>
              刷新概览
            </Button>
          </Group>
          {loading && !overview ? <Alert color="gray" variant="light">正在读取数据库概览...</Alert> : null}
          {overview ? (
            <div className="overview-grid">
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">数据库文件</Text>
                <Text fw={700} size="sm" mt={4}>{overview.database_path.split("/").pop()}</Text>
                <Text size="xs" c="dimmed" mt={4}>{overview.database_path}</Text>
              </Paper>
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">文件大小</Text>
                <Text fw={700} size="sm" mt={4}>{formatBytes(overview.database_size)}</Text>
                <Text size="xs" c="dimmed" mt={4}>SQLite {overview.sqlite_version}</Text>
              </Paper>
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">数据表数量</Text>
                <Text fw={700} size="sm" mt={4}>{overview.table_count}</Text>
                <Text size="xs" c="dimmed" mt={4}>轻量读取表清单</Text>
              </Paper>
            </div>
          ) : null}
        </Stack>
      </Paper>

      <div className="database-grid">
        <Paper withBorder radius="lg" p="sm">
          <Stack gap="sm">
            <div>
              <Title order={4}>表列表</Title>
              <Text size="xs" c="dimmed">快速切换数据表</Text>
            </div>
            <ScrollArea className="table-list-scroll">
              <Stack gap="xs">
                {overview?.tables.map((table) => (
                  <UnstyledButton
                    key={table.name}
                    className="database-table-item"
                    data-active={String(table.name === selectedTable)}
                    onClick={() => handleSelectTable(table.name)}
                  >
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Stack gap={2}>
                        <Text fw={600} size="xs">{table.name}</Text>
                        <Text size="xs" c="dimmed">
                          {table.column_count} 列 / {table.row_identity.mode}
                        </Text>
                      </Stack>
                      <Badge size="sm" variant="light" color="gray">
                        {table.record_count == null ? "? 行" : `${table.record_count} 行`}
                      </Badge>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Paper>

        <div className="database-center">
          <Paper withBorder radius="lg" p="sm">
            <Tabs value={centerTab} onChange={(value) => setCenterTab((value as "browse" | "sql") || "browse")} keepMounted={false} variant="outline" radius="md">
              <Tabs.List>
                <Tabs.Tab value="browse">数据浏览</Tabs.Tab>
                <Tabs.Tab value="sql">SQL 执行</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="browse" pt="xs">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600} size="sm">数据浏览</Text>
                      <Text size="xs" c="dimmed">{selectedTable ? `当前表: ${selectedTable}` : "请选择左侧数据表"}</Text>
                    </div>
                    <Group gap="xs">
                      <Button size="compact-xs" variant="subtle" color="orange" onClick={handleApplyQuery}>筛选</Button>
                      <Button size="compact-xs" variant="subtle" color="gray" onClick={handleResetQuery}>重置</Button>
                      <Button size="compact-xs" variant="filled" color="red" onClick={handleDeleteSelected} disabled={!selectedKeys.length}>
                        删除选中
                      </Button>
                    </Group>
                  </Group>

                  <div className="toolbar-grid">
                    <TextInput size="xs" value={keyword} onChange={(event) => setKeyword(event.currentTarget.value)} placeholder="关键字搜索" />
                    <NativeSelect size="xs" data={searchableFieldOptions} value={searchField} onChange={(event) => setSearchField(event.currentTarget.value)} />
                    <NativeSelect size="xs" data={filterFieldOptions} value={filterField} onChange={(event) => setFilterField(event.currentTarget.value)} />
                    <NativeSelect
                      size="xs"
                      data={FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                      value={filterOperator}
                      onChange={(event) => setFilterOperator(event.currentTarget.value as DatabaseQueryFilterOperator)}
                    />
                    <TextInput size="xs" value={filterValue} onChange={(event) => setFilterValue(event.currentTarget.value)} placeholder="筛选值" />
                  </div>

                  {tableLoading && !tableData ? (
                    <Paper withBorder radius="md" p="xl">
                      <Center>
                        <Stack gap="xs" align="center">
                          <Loader color="orange" size="sm" />
                          <Text size="sm" c="dimmed">正在加载 {selectedTable || "数据表"} ...</Text>
                        </Stack>
                      </Center>
                    </Paper>
                  ) : null}
                  {tableData ? (
                    <Stack gap="xs">
                      <div className="database-table-scroll">
                        <Table className="database-data-table" striped highlightOnHover withTableBorder withColumnBorders horizontalSpacing="xs" verticalSpacing={6} fz="xs">
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th className="database-sticky-cell database-sticky-cell--select">
                                <Checkbox
                                  checked={tableData.list.length > 0 && tableData.list.every((row) => selectedKeys.includes(getIdentityKey(tableData.row_identity, row)))}
                                  onChange={handleSelectAllCurrentPage}
                                />
                              </Table.Th>
                              {tableData.columns.map((column, columnIndex) => (
                                <Table.Th
                                  key={column}
                                  className={columnIndex === 0 ? "database-sticky-cell database-sticky-cell--identity" : "database-data-cell"}
                                >
                                  <Button variant="subtle" size="compact-xs" color="dark" onClick={() => handleSort(column)}>
                                    {column}{sortField === column ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                                  </Button>
                                </Table.Th>
                              ))}
                              <Table.Th className="database-sticky-cell database-sticky-cell--actions">操作</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {tableData.list.map((row) => (
                              <Table.Tr key={getIdentityKey(tableData.row_identity, row)}>
                                <Table.Td className="database-sticky-cell database-sticky-cell--select">
                                  <Checkbox
                                    checked={selectedKeys.includes(getIdentityKey(tableData.row_identity, row))}
                                    onChange={() => handleToggleRow(row)}
                                  />
                                </Table.Td>
                                {tableData.columns.map((column, columnIndex) => (
                                  <Table.Td
                                    key={column}
                                    className={columnIndex === 0 ? "database-sticky-cell database-sticky-cell--identity" : "database-data-cell"}
                                  >
                                    {row[column] == null ? <Text span c="dimmed">NULL</Text> : String(row[column])}
                                  </Table.Td>
                                ))}
                                <Table.Td className="database-sticky-cell database-sticky-cell--actions">
                                  <Group gap={4} wrap="nowrap">
                                    <Button variant="subtle" color="gray" size="compact-xs" onClick={() => handleViewRow(row)}>
                                      查看
                                    </Button>
                                    <Button variant="subtle" color="orange" size="compact-xs" onClick={() => handleEditRow(row)}>
                                      编辑
                                    </Button>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </div>

                      <Group justify="space-between" align="center">
                        <Text size="xs" c="dimmed">
                          第 {tableData.pagination.current_page} / {totalPages} 页，共 {tableData.pagination.total} 条
                        </Text>
                        <Group gap="xs">
                          <NativeSelect
                            size="xs"
                            data={pageSizeOptions}
                            value={String(pageSize)}
                            onChange={(event) => handlePageSizeChange(Number(event.currentTarget.value))}
                          />
                          <Pagination size="xs" total={totalPages} value={currentPage} onChange={handlePageChange} />
                        </Group>
                      </Group>
                    </Stack>
                  ) : (
                    <Alert color="gray" variant="light">请选择数据表后开始浏览。</Alert>
                  )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="sql" pt="xs">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600} size="sm">SQL 执行</Text>
                      <Text size="xs" c="dimmed">仅允许单条 SELECT / WITH / INSERT / UPDATE / DELETE 语句</Text>
                    </div>
                    <Button size="compact-xs" variant="filled" color="orange" onClick={handleExecuteSql} loading={sqlRunning}>
                      执行 SQL
                    </Button>
                  </Group>

                  <div className="sql-editor-shell">
                    <div className="sql-editor">
                      <pre className="sql-editor__highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `${sqlPreview || " "}\n` }} />
                      <Textarea
                        className="sql-editor__input"
                        size="xs"
                        value={sqlText}
                        onChange={(event) => setSqlText(event.currentTarget.value)}
                        minRows={8}
                        autosize={false}
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  {sqlResult ? (
                    <Stack gap="xs">
                      <Group gap="xs">
                        <Badge size="sm" variant="light">类型: {sqlResult.statement_type.toUpperCase()}</Badge>
                        <Badge size="sm" variant="light">返回行数: {sqlResult.row_count}</Badge>
                        <Badge size="sm" variant="light">影响行数: {sqlResult.affected_rows}</Badge>
                        {sqlResult.truncated ? <Badge size="sm" variant="light" color="yellow">结果已截断到 200 行</Badge> : null}
                      </Group>
                      {sqlResult.columns.length ? (
                        <div className="database-table-scroll">
                          <Table striped highlightOnHover withTableBorder withColumnBorders horizontalSpacing="xs" verticalSpacing={6} fz="xs">
                            <Table.Thead>
                              <Table.Tr>
                                {sqlResult.columns.map((column) => <Table.Th key={column}>{column}</Table.Th>)}
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {sqlResult.list.map((row, index) => (
                                <Table.Tr key={`${index}-${sqlResult.columns.join("-")}`}>
                                  {sqlResult.columns.map((column) => (
                                    <Table.Td key={column}>
                                      {row[column] == null ? <Text span c="dimmed">NULL</Text> : String(row[column])}
                                    </Table.Td>
                                  ))}
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </div>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Paper>
        </div>

        <div className="database-side">
          <Paper withBorder radius="lg" p="sm">
            <Tabs value={sideTab} onChange={(value) => setSideTab((value as "schema" | "form" | "json") || "schema")} keepMounted={false} variant="outline" radius="md">
              <Tabs.List>
                <Tabs.Tab value="schema">表结构</Tabs.Tab>
                <Tabs.Tab value="form">数据操作</Tabs.Tab>
                <Tabs.Tab value="json">JSON 查看</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="schema" pt="xs">
                <Stack gap="sm">
                  <div>
                    <Text fw={600} size="sm">表结构</Text>
                    <Text size="xs" c="dimmed">{selectedTable || "当前未选择数据表"}</Text>
                  </div>
                  {tableDetail ? (
                    <Stack gap="xs">
                      <Paper withBorder radius="md" p="xs">
                        <Text size="xs" c="dimmed">写入能力</Text>
                        <Text fw={700} size="sm" mt={4}>{tableDetail.writable ? "可写" : "只读"}</Text>
                        <Text size="xs" c="dimmed" mt={4}>
                          {tableDetail.row_identity.mode === "rowid" ? "使用 rowid 定位记录。" : null}
                          {tableDetail.row_identity.mode === "primary_key" ? `使用主键 ${tableDetail.row_identity.fields.join(", ")} 定位记录。` : null}
                          {tableDetail.row_identity.mode === "read_only" ? tableDetail.row_identity.reason : null}
                        </Text>
                      </Paper>

                      <Stack gap="xs">
                        {tableDetail.columns.map((column) => (
                          <Paper key={column.name} withBorder radius="md" p="xs">
                            <Group justify="space-between">
                              <Text fw={600} size="xs">{column.name}</Text>
                              <Badge size="sm" variant="light" color="gray">{column.type || "TEXT"}</Badge>
                            </Group>
                            <Text size="xs" c="dimmed" mt={4}>
                              {column.primary_key_order ? `PK(${column.primary_key_order}) ` : ""}
                              {column.notnull ? "NOT NULL " : ""}
                              {column.default_value ? `DEFAULT ${column.default_value}` : ""}
                            </Text>
                          </Paper>
                        ))}
                      </Stack>

                      <Stack gap="xs">
                        <Text fw={600} size="sm">索引</Text>
                        {tableDetail.indexes.length ? tableDetail.indexes.map((index) => (
                          <Paper key={index.name} withBorder radius="md" p="xs">
                            <Group justify="space-between">
                              <Text fw={600} size="xs">{index.name}</Text>
                              <Badge size="sm" variant="light" color={index.unique ? "orange" : "gray"}>
                                {index.unique ? "UNIQUE" : "INDEX"}
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed" mt={4}>{index.columns.join(", ") || "无字段信息"}</Text>
                          </Paper>
                        )) : <Alert color="gray" variant="light">当前表没有额外索引。</Alert>}
                      </Stack>

                      <pre className="code-block">{tableDetail.create_sql}</pre>
                    </Stack>
                  ) : (
                    <Alert color="gray" variant="light">请先选择数据表。</Alert>
                  )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="form" pt="xs">
                <Stack gap="sm" data-debug-panel="form">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600} size="sm">数据操作</Text>
                      <Text size="xs" c="dimmed">{formMode === "create" ? "新增记录" : "编辑当前记录"}</Text>
                    </div>
                    <Button size="compact-xs" variant="subtle" color="orange" onClick={handleCreateRow}>新建记录</Button>
                  </Group>
                  {tableDetail ? (
                    <Stack gap="xs">
                      {tableDetail.columns.map((column) => (
                        <TextInput
                          size="xs"
                          key={column.name}
                          label={column.name}
                          placeholder={column.type || "TEXT"}
                          value={formValues[column.name] ?? ""}
                          onChange={(event) => setFormValues((currentValue) => ({ ...currentValue, [column.name]: event.currentTarget.value }))}
                        />
                      ))}
                      <Button size="compact-xs" variant="filled" color="orange" onClick={handleSubmitForm} disabled={!tableDetail.writable}>
                        {formMode === "create" ? "新增记录" : "保存修改"}
                      </Button>
                      {!tableDetail.writable ? <Alert color="yellow" variant="light">当前表无法安全定位单行记录，因此只开放浏览。</Alert> : null}
                    </Stack>
                  ) : (
                    <Alert color="gray" variant="light">请先选择数据表。</Alert>
                  )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="json" pt="xs">
                <Stack gap="sm" data-debug-panel="json">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600} size="sm">JSON 查看</Text>
                      <Text size="xs" c="dimmed">查看当前选中行的完整结构</Text>
                    </div>
                    <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setViewingRow(null)} disabled={!viewingRow}>
                      清空
                    </Button>
                  </Group>
                  {viewingRow ? (
                    <pre className="code-block">{JSON.stringify(viewingRow, null, 2)}</pre>
                  ) : (
                    <Alert color="gray" variant="light">点击数据浏览里的“查看”后，这里会显示格式化 JSON。</Alert>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>

            {message ? <Alert color="green" variant="light" mt="sm">{message}</Alert> : null}
            {error ? <Alert color="red" variant="light" mt="sm">{error}</Alert> : null}
          </Paper>
        </div>
      </div>
    </Stack>
  );
}
