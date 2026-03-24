/**
 * @fileoverview
 * React 的回测详情页面，负责承载该路由对应的完整页面状态与交互。
 *
 * 主要职责：
 * - 对外暴露：BacktestDetailPage。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 根据 URL query、接口结果和本地状态渲染页面。
 * - 把页面级操作拆给 API 工具和子组件。
 */

import { Alert, Stack, Text, Title } from "@mantine/core";
import type { BacktestRunDetail, BacktestRunItem } from "@contracts/workbench";
import { BottomResultPanel } from "@/components/workbench/BottomResultPanel";
import { ResourceSidebar } from "@/components/workbench/ResourceSidebar";

type BacktestDetailPageProps = {
  runs: BacktestRunItem[];
  selectedRunId: string;
  selectedRun: BacktestRunDetail | null;
  error: string;
  onSelectRun: (runId: string) => void;
};

export function BacktestDetailPage({
  runs,
  selectedRunId,
  selectedRun,
  error,
  onSelectRun,
}: BacktestDetailPageProps) {
  return (
    <Stack gap="sm">
      <div>
        <Title order={4}>回测详情</Title>
        <Text size="xs" c="dimmed">独立路由展示单次回测的完整结果，支持通过 URL 直接打开</Text>
      </div>
      {error ? <Alert color="red" py={8}>{error}</Alert> : null}
      <div className="backtest-detail-grid">
        <ResourceSidebar runs={runs} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />
        <BottomResultPanel run={selectedRun} />
      </div>
    </Stack>
  );
}
