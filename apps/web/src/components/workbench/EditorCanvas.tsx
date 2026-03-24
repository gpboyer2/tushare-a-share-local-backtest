/**
 * @fileoverview
 * React 的工作台中间编辑画布，负责工作台中的局部界面区域与对应交互。
 *
 * 主要职责：
 * - 对外暴露：EditorCanvas、buildPreview。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 接收父级状态并渲染局部 UI。
 * - 围绕工作台资源、编辑、检查或结果区域组织交互。
 */

import { Alert, Badge, Group, List, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import type { BacktestConfig, BacktestRunDetail, StrategyDraft } from "@contracts/workbench";

type EditorCanvasProps = {
  strategy: StrategyDraft;
  config: BacktestConfig;
  selectedRun: BacktestRunDetail | null;
  error: string;
};

function buildPreview(config: BacktestConfig) {
  return JSON.stringify(config, null, 2);
}

export function EditorCanvas({ strategy, config, selectedRun, error }: EditorCanvasProps) {
  return (
    <Paper withBorder radius="lg" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>策略编辑区</Title>
            <Text size="xs" c="dimmed">右侧修改参数后可直接发起回测</Text>
          </div>
          <Badge size="sm" variant="light" color="teal">Linked to Python</Badge>
        </Group>

        <Paper withBorder radius="md" px="sm" py="xs" bg="orange.0">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div className="compact-header-copy">
              <Text size="xs" tt="uppercase" fw={700} c="orange.8">Workbench</Text>
              <Text fw={700} size="sm">{strategy.name}</Text>
              <Text size="xs" c="dimmed">{strategy.description}</Text>
            </div>
            <div className="compact-badge-list">
              <Badge size="sm" variant="light" color="gray">v{strategy.version}</Badge>
              <Badge size="sm" variant="light" color="orange">{config.backtest.start_date} ~ {config.backtest.end_date}</Badge>
              <Badge size="sm" variant="light" color="blue">{strategy.universeLabel}</Badge>
            </div>
          </Group>
        </Paper>

        <div className="editor-grid">
          <Paper withBorder radius="md" p="sm" className="editor-main-panel">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600} size="sm">策略逻辑与运行状态</Text>
                <Badge size="sm" variant="light" color={selectedRun?.status === "finished" ? "green" : selectedRun?.status === "failed" ? "red" : "orange"}>
                  {selectedRun?.status ?? "idle"}
                </Badge>
              </Group>
              <List type="ordered" spacing="xs" size="sm">
                {strategy.rules.map((rule) => (
                  <List.Item key={rule.id}>
                    <Text fw={600} size="xs">{rule.title}</Text>
                    <Text size="xs" c="dimmed">{rule.summary}</Text>
                  </List.Item>
                ))}
              </List>
              {error ? <Alert color="red" title="运行错误">{error}</Alert> : null}
            </Stack>
          </Paper>

          <Stack gap="md">
            <Paper withBorder radius="md" p="sm">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600} size="sm">执行入口</Text>
                  <Badge size="sm" variant="light" color="green">已接通</Badge>
                </Group>
                <Group gap="xs">
                  {strategy.executionPorts.map((port) => (
                    <Badge key={port} variant="light" color="gray" size="sm">
                      {port}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="sm">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600} size="sm">当前配置预览</Text>
                  <Badge size="sm" variant="outline">JSON</Badge>
                </Group>
                <pre className="code-block">{buildPreview(config)}</pre>
              </Stack>
            </Paper>
          </Stack>
        </div>
      </Stack>
    </Paper>
  );
}
