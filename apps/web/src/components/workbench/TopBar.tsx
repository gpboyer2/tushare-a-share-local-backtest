/**
 * @fileoverview
 * React 的工作台顶部栏，负责工作台中的局部界面区域与对应交互。
 *
 * 主要职责：
 * - 对外暴露：TopBar、getRunStatusColor。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 接收父级状态并渲染局部 UI。
 * - 围绕工作台资源、编辑、检查或结果区域组织交互。
 */

import { Avatar, Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import type { BacktestRunDetail, StrategyDraft } from "@contracts/workbench";

type TopBarProps = {
  strategy: StrategyDraft;
  selectedRun: BacktestRunDetail | null;
  onRunBacktest: () => void;
  running: boolean;
  activeRoute: "workbench" | "backtest-detail" | "database";
  onOpenWorkbench: () => void;
  onOpenBacktestDetail: () => void;
  onOpenDatabase: () => void;
};

function getRunStatusColor(status: BacktestRunDetail["status"] | undefined) {
  if (status === "finished") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  if (status === "running" || status === "queued") {
    return "orange";
  }
  return "gray";
}

export function TopBar({
  strategy,
  selectedRun,
  onRunBacktest,
  running,
  activeRoute,
  onOpenWorkbench,
  onOpenBacktestDetail,
  onOpenDatabase,
}: TopBarProps) {
  const statusLabel = selectedRun
    ? selectedRun.status === "finished"
      ? "最近一次回测已完成"
      : selectedRun.status === "failed"
        ? "最近一次回测失败"
        : "回测运行中"
    : "尚未发起网页回测";

  return (
    <div className="topbar-shell">
      <Group justify="space-between" align="center" wrap="nowrap" className="topbar-layout">
        <Group gap="sm" wrap="nowrap">
          <Avatar color="orange" radius="md" size="sm">PPLL</Avatar>
          <Stack gap={2}>
            <Text fw={700} size="sm">{strategy.name}</Text>
            <Text size="xs" c="dimmed">{strategy.modeLabel}</Text>
          </Stack>
        </Group>

        <Group gap="xs" className="topbar-nav" wrap="wrap">
          <Button
            size="compact-sm"
            variant={activeRoute === "workbench" ? "light" : "subtle"}
            color="orange"
            onClick={onOpenWorkbench}
          >
            工作台
          </Button>
          <Button
            size="compact-sm"
            variant={activeRoute === "backtest-detail" ? "light" : "subtle"}
            color="orange"
            onClick={onOpenBacktestDetail}
            disabled={!selectedRun}
          >
            回测详情
          </Button>
          <Button
            size="compact-sm"
            variant={activeRoute === "database" ? "filled" : "subtle"}
            color="dark"
            onClick={onOpenDatabase}
          >
            数据库管理
          </Button>
        </Group>

        <Group gap="sm" wrap="nowrap">
          <Paper withBorder radius="md" px={8} py={6} className="topbar-status-card">
            <Group gap={6} wrap="nowrap">
              <Badge size="sm" color={getRunStatusColor(selectedRun?.status)} variant="light">
                {selectedRun?.status ?? "idle"}
              </Badge>
              <Stack gap={0}>
                <Text fw={600} size="xs">{statusLabel}</Text>
                <Text size="xs" c="dimmed">{selectedRun?.finishedAt || selectedRun?.startedAt || "等待第一次运行"}</Text>
              </Stack>
            </Group>
          </Paper>
          <Badge variant="light" color="teal" size="sm">
            Python Core 已接通
          </Badge>
          <Button size="compact-sm" variant="filled" color="orange" onClick={onRunBacktest} loading={running}>
            运行回测
          </Button>
        </Group>
      </Group>
    </div>
  );
}
