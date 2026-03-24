/**
 * @fileoverview
 * React 的工作台页面，负责承载该路由对应的完整页面状态与交互。
 *
 * 主要职责：
 * - 对外暴露：WorkbenchPage。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 根据 URL query、接口结果和本地状态渲染页面。
 * - 把页面级操作拆给 API 工具和子组件。
 */

import { Stack } from "@mantine/core";
import type {
  BacktestConfig,
  BacktestRunDetail,
  BacktestRunItem,
  WorkbenchBootstrap,
} from "@contracts/workbench";
import { BottomResultPanel } from "@/components/workbench/BottomResultPanel";
import { EditorCanvas } from "@/components/workbench/EditorCanvas";
import { InspectorPanel } from "@/components/workbench/InspectorPanel";
import { ResourceSidebar } from "@/components/workbench/ResourceSidebar";
import { hydrateFormGroups, setConfigValue } from "@/lib/config";
type WorkbenchPageProps = {
  bootstrap: WorkbenchBootstrap;
  config: BacktestConfig;
  runs: BacktestRunItem[];
  selectedRunId: string;
  selectedRun: BacktestRunDetail | null;
  error: string;
  onSelectRun: (runId: string) => void;
  onFieldChange: (path: string, rawValue: string | number | boolean, type: string) => void;
  onReset: () => void;
};

export function WorkbenchPage({
  bootstrap,
  config,
  runs,
  selectedRunId,
  selectedRun,
  error,
  onSelectRun,
  onFieldChange,
  onReset,
}: WorkbenchPageProps) {
  const hydratedGroups = hydrateFormGroups(bootstrap.formGroups, config);

  return (
    <Stack gap="sm">
      <div className="workbench-grid">
        <ResourceSidebar
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={onSelectRun}
        />
        <EditorCanvas strategy={bootstrap.strategy} config={config} selectedRun={selectedRun} error={error} />
        <InspectorPanel groups={hydratedGroups} onFieldChange={onFieldChange} onReset={onReset} />
      </div>
      <BottomResultPanel run={selectedRun} />
    </Stack>
  );
}
