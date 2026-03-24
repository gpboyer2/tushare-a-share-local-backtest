/**
 * @fileoverview
 * 前端的前端应用路由壳层模块。
 *
 * 主要职责：
 * - 对外暴露：AppRouter、openWorkbench、openBacktestDetail、openDatabase、handleSelectRun、load、loadRun、handleFieldChange。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 负责 React 应用初始化、路由装配或页面壳层组织。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppShell, Center, Loader, Stack, Text } from "@mantine/core";
import type {
  BacktestConfig,
  BacktestRunDetail,
  BacktestRunItem,
  WorkbenchBootstrap,
} from "@contracts/workbench";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TopBar } from "@/components/workbench/TopBar";
import {
  createBacktestRun,
  fetchBacktestRunDetail,
  fetchBacktestRuns,
  fetchWorkbenchBootstrap,
} from "@/lib/api";
import { formatRouteTarget, logWebRouteChange } from "@/lib/debug-log";
import { APP_ROUTES, buildQueryString } from "@/lib/routes";
import { setConfigValue } from "@/lib/config";
import { BacktestDetailPage } from "@/pages/BacktestDetailPage";
import { DatabaseManagerPage } from "@/pages/DatabaseManagerPage";
import { WorkbenchPage } from "@/pages/WorkbenchPage";

function AppRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const previous_route_ref = useRef("");
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrap | null>(null);
  const [config, setConfig] = useState<BacktestConfig | null>(null);
  const [runs, setRuns] = useState<BacktestRunItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<BacktestRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const search_params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedRunId = search_params.get("run_id") || "";
  const latestRunId = runs[0]?.id ?? bootstrap?.latestRuns[0]?.id ?? "";
  const effectiveRunId = selectedRunId || latestRunId;
  const activeRoute = location.pathname === APP_ROUTES.database
    ? "database"
    : location.pathname === APP_ROUTES.backtest_detail
      ? "backtest-detail"
      : "workbench";

  useEffect(() => {
    const current_route = formatRouteTarget(location);
    const previous_route = previous_route_ref.current;
    const source = typeof location.state === "object" && location.state && "log_source" in location.state
      ? String(location.state.log_source || "")
      : "";
    if (!previous_route) {
      logWebRouteChange("initial", current_route, source || "initial-load");
      previous_route_ref.current = current_route;
      return;
    }
    if (previous_route !== current_route) {
      logWebRouteChange(previous_route, current_route, source);
      previous_route_ref.current = current_route;
    }
  }, [location]);

  function openWorkbench(runId = effectiveRunId) {
    navigate(
      {
        pathname: APP_ROUTES.workbench,
        search: buildQueryString({ run_id: runId }),
      },
      { state: { log_source: "App:openWorkbench" } },
    );
  }

  function openBacktestDetail(runId = effectiveRunId) {
    navigate(
      {
        pathname: APP_ROUTES.backtest_detail,
        search: buildQueryString({ run_id: runId }),
      },
      { state: { log_source: "App:openBacktestDetail" } },
    );
  }

  function openDatabase() {
    navigate(
      {
        pathname: APP_ROUTES.database,
      },
      { state: { log_source: "App:openDatabase" } },
    );
  }

  function handleSelectRun(runId: string) {
    navigate(
      {
        pathname: location.pathname === APP_ROUTES.database ? APP_ROUTES.backtest_detail : location.pathname,
        search: buildQueryString({ run_id: runId }),
      },
      { state: { log_source: "App:handleSelectRun" } },
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [nextBootstrap, nextRuns] = await Promise.all([
          fetchWorkbenchBootstrap(),
          fetchBacktestRuns(),
        ]);
        if (cancelled) {
          return;
        }
        setBootstrap(nextBootstrap);
        setConfig(nextBootstrap.config);
        setRuns(nextRuns.items);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!effectiveRunId) {
      setSelectedRun(null);
      return;
    }

    let cancelled = false;

    async function loadRun() {
      try {
        const detail = await fetchBacktestRunDetail(effectiveRunId);
        if (!cancelled) {
          setSelectedRun(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    }

    void loadRun();
    return () => {
      cancelled = true;
    };
  }, [effectiveRunId]);

  useEffect(() => {
    if (
      location.pathname !== APP_ROUTES.database
      && location.pathname !== "/"
      && !selectedRunId
      && latestRunId
    ) {
      navigate(
        {
          pathname: location.pathname,
          search: buildQueryString({ run_id: latestRunId }),
        },
        {
          replace: true,
          state: { log_source: "App:syncLatestRunId" },
        },
      );
    }
  }, [location.pathname, navigate, selectedRunId, latestRunId]);

  useEffect(() => {
    if (!selectedRun || (selectedRun.status !== "queued" && selectedRun.status !== "running")) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const [detail, nextRuns] = await Promise.all([
          fetchBacktestRunDetail(selectedRun.id),
          fetchBacktestRuns(),
        ]);
        setSelectedRun(detail);
        setRuns(nextRuns.items);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : String(pollError));
      }
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedRun]);

  function handleFieldChange(path: string, rawValue: string | number | boolean, type: string) {
    if (!config) {
      return;
    }

    let nextValue = rawValue;
    if (type === "number") {
      nextValue = Number(rawValue);
    }
    setConfig(setConfigValue(config, path, nextValue));
  }

  async function handleRunBacktest() {
    if (!config) {
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const detail = await createBacktestRun({ config });
      setSelectedRun(detail);
      const nextRuns = await fetchBacktestRuns();
      setRuns(nextRuns.items);
      openBacktestDetail(detail.id);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetConfig() {
    if (!bootstrap) {
      return;
    }
    setConfig(structuredClone(bootstrap.config));
  }

  if (loading) {
    return (
      <Center className="screen-state">
        <Stack align="center" gap="sm">
          <Loader color="orange" />
          <Text c="dimmed">正在加载网页工作台...</Text>
        </Stack>
      </Center>
    );
  }

  if (!bootstrap || !config) {
    return (
      <Center className="screen-state">
        <Alert color="red" title="初始化失败" maw={520}>
          未能读取工作台初始化数据。
        </Alert>
      </Center>
    );
  }

  const running = submitting || selectedRun?.status === "running" || selectedRun?.status === "queued";

  return (
    <AppShell header={{ height: 68 }} padding="sm" className="app-shell">
      <AppShell.Header>
        <TopBar
          strategy={bootstrap.strategy}
          selectedRun={selectedRun}
          onRunBacktest={handleRunBacktest}
          running={running}
          activeRoute={activeRoute}
          onOpenWorkbench={() => openWorkbench()}
          onOpenBacktestDetail={() => openBacktestDetail()}
          onOpenDatabase={openDatabase}
        />
      </AppShell.Header>
      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Navigate to={APP_ROUTES.workbench} replace />} />
          <Route
            path={APP_ROUTES.workbench}
            element={(
              <WorkbenchPage
                bootstrap={bootstrap}
                config={config}
                runs={runs}
                selectedRunId={effectiveRunId}
                selectedRun={selectedRun}
                error={error}
                onSelectRun={handleSelectRun}
                onFieldChange={handleFieldChange}
                onReset={handleResetConfig}
              />
            )}
          />
          <Route
            path={APP_ROUTES.backtest_detail}
            element={(
              <BacktestDetailPage
                runs={runs}
                selectedRunId={effectiveRunId}
                selectedRun={selectedRun}
                error={error}
                onSelectRun={handleSelectRun}
              />
            )}
          />
          <Route path={APP_ROUTES.database} element={<DatabaseManagerPage />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRouter />
    </HashRouter>
  );
}
