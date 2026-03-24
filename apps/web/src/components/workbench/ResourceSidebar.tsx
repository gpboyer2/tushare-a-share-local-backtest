/**
 * @fileoverview
 * React 的工作台左侧资源侧栏，负责工作台中的局部界面区域与对应交互。
 *
 * 主要职责：
 * - 对外暴露：ResourceSidebar、summarizeRun、getRunStatusColor。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 接收父级状态并渲染局部 UI。
 * - 围绕工作台资源、编辑、检查或结果区域组织交互。
 */

import { Badge, Group, Paper, ScrollArea, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import type { BacktestRunItem } from "@contracts/workbench";

type ResourceSidebarProps = {
  runs: BacktestRunItem[];
  selectedRunId: string;
  onSelectRun: (runId: string) => void;
};

function summarizeRun(run: BacktestRunItem) {
  if (!run.summary) {
    return run.status === "running" || run.status === "queued" ? "等待结果..." : "暂无 summary";
  }
  return `收益 ${(run.summary.total_return * 100).toFixed(2)}% / 交易 ${run.summary.trade_count} 笔`;
}

function getRunStatusColor(status: BacktestRunItem["status"]) {
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

export function ResourceSidebar({ runs, selectedRunId, onSelectRun }: ResourceSidebarProps) {
  return (
    <Paper withBorder radius="lg" p="sm">
      <Stack gap="sm">
        <div>
          <Title order={4}>资源区</Title>
          <Text size="xs" c="dimmed">回测任务与系统分层</Text>
        </div>

        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">回测任务</Text>
            <Badge size="sm" variant="light" color="gray">{runs.length}</Badge>
          </Group>
          <ScrollArea className="panel-scroll">
            <Stack gap="xs">
              {runs.map((run) => (
                <UnstyledButton
                  key={run.id}
                  className="resource-item"
                  data-active={String(run.id === selectedRunId)}
                  onClick={() => onSelectRun(run.id)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600} size="xs">{run.label}</Text>
                      <Text size="xs" c="dimmed">{summarizeRun(run)}</Text>
                    </Stack>
                    <Badge size="sm" color={getRunStatusColor(run.status)} variant="light">
                      {run.status}
                    </Badge>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">当前结构</Text>
            <Badge size="sm" variant="light" color="gray">4 层</Badge>
          </Group>
          <Stack gap="xs">
            {[
              ["apps/web", "React 工作台"],
              ["apps/server", "Node 编排层"],
              ["shared/contracts", "共享契约"],
              ["src/ppll_bt", "Python 回测内核"],
            ].map(([label, description]) => (
              <Paper key={label} withBorder radius="md" p="xs">
                <Text fw={600} size="xs">{label}</Text>
                <Text size="xs" c="dimmed">{description}</Text>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
