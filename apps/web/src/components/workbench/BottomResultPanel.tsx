/**
 * @fileoverview
 * React 的工作台底部结果面板，负责工作台中的局部界面区域与对应交互。
 *
 * 主要职责：
 * - 对外暴露：BottomResultPanel、renderEquityPath、formatPercent、x。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 接收父级状态并渲染局部 UI。
 * - 围绕工作台资源、编辑、检查或结果区域组织交互。
 */

import { Alert, Badge, Group, Paper, ScrollArea, SimpleGrid, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import type { BacktestRunDetail, EquityPoint } from "@contracts/workbench";

type BottomResultPanelProps = {
  run: BacktestRunDetail | null;
};

function renderEquityPath(points: EquityPoint[]) {
  if (points.length === 0) {
    return "";
  }
  const width = 560;
  const height = 160;
  const values = points.map((point) => point.total_equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.total_equity - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function BottomResultPanel({ run }: BottomResultPanelProps) {
  const result = run?.result;
  const equityPath = result ? renderEquityPath(result.equity_curve) : "";

  return (
    <Paper withBorder radius="lg" p="sm">
      <Stack gap="sm">
        <div>
          <Title order={4}>结果区</Title>
          <Text size="xs" c="dimmed">运行日志、收益曲线、订单明细和筛选记录</Text>
        </div>

        {run ? (
          <Stack gap="sm">
            <SimpleGrid cols={4} spacing="xs">
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">任务状态</Text>
                <Badge size="sm" mt={4} color={run.status === "finished" ? "green" : run.status === "failed" ? "red" : "orange"} variant="light">
                  {run.status}
                </Badge>
              </Paper>
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">输出目录</Text>
                <Text fw={700} size="xs" mt={4} lineClamp={1}>{run.outputDir || "--"}</Text>
              </Paper>
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">累计收益</Text>
                <Text fw={700} size="sm" mt={4}>{run.summary ? formatPercent(run.summary.total_return) : "--"}</Text>
              </Paper>
              <Paper withBorder radius="md" p="xs">
                <Text size="xs" c="dimmed">最大回撤</Text>
                <Text fw={700} size="sm" mt={4}>{run.summary ? formatPercent(run.summary.max_drawdown) : "--"}</Text>
              </Paper>
            </SimpleGrid>

            {run.error ? <Alert color="red" title="任务失败" py={8}>{run.error}</Alert> : null}

            <Tabs defaultValue="logs" keepMounted={false} variant="outline" radius="md">
              <Tabs.List>
                <Tabs.Tab value="logs">运行日志</Tabs.Tab>
                <Tabs.Tab value="equity">收益曲线</Tabs.Tab>
                <Tabs.Tab value="trades">订单明细</Tabs.Tab>
                <Tabs.Tab value="screenings">筛选记录</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="logs" pt="xs">
                <ScrollArea className="result-tabs-scroll">
                  <Stack gap="xs">
                    {run.logs.map((entry) => (
                      <Paper key={`${entry.time}-${entry.message}`} withBorder radius="md" p="xs">
                        <Text size="xs" c="dimmed">{entry.time}</Text>
                        <Text size="xs">{entry.message}</Text>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>

              <Tabs.Panel value="equity" pt="xs">
                <Paper withBorder radius="md" p="sm">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600} size="sm">收益曲线</Text>
                    <Badge size="sm" variant="light">{result?.equity_curve.length ?? 0} 点</Badge>
                  </Group>
                  {result && result.equity_curve.length > 0 ? (
                    <svg viewBox="0 0 560 160" className="equity-chart" preserveAspectRatio="none">
                      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={equityPath} />
                    </svg>
                  ) : (
                    <Alert color="gray" variant="light">当前没有可绘制的收益曲线。</Alert>
                  )}
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="trades" pt="xs">
                <Paper withBorder radius="md" p="sm">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600} size="sm">订单明细</Text>
                    <Badge size="sm" variant="light">{result?.trades.length ?? 0} 笔</Badge>
                  </Group>
                  <ScrollArea className="result-table-scroll">
                    <Table striped highlightOnHover withTableBorder withColumnBorders horizontalSpacing="xs" verticalSpacing={6} fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>日期</Table.Th>
                          <Table.Th>标的</Table.Th>
                          <Table.Th>方向</Table.Th>
                          <Table.Th>价格</Table.Th>
                          <Table.Th>数量</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {result?.trades.slice(0, 12).map((trade) => (
                          <Table.Tr key={`${trade.trade_date}-${trade.ts_code}-${trade.side}-${trade.quantity}`}>
                            <Table.Td>{trade.trade_date}</Table.Td>
                            <Table.Td>{trade.ts_code}</Table.Td>
                            <Table.Td>{trade.side}</Table.Td>
                            <Table.Td>{trade.price.toFixed(2)}</Table.Td>
                            <Table.Td>{trade.quantity}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="screenings" pt="xs">
                <Paper withBorder radius="md" p="sm">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600} size="sm">筛选记录</Text>
                    <Badge size="sm" variant="light">{result?.screenings.length ?? 0} 条</Badge>
                  </Group>
                  <ScrollArea className="result-table-scroll">
                    <Table striped highlightOnHover withTableBorder withColumnBorders horizontalSpacing="xs" verticalSpacing={6} fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>日期</Table.Th>
                          <Table.Th>触发</Table.Th>
                          <Table.Th>入围</Table.Th>
                          <Table.Th>选中</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {result?.screenings.slice(0, 8).map((screening) => (
                          <Table.Tr key={`${screening.trade_date}-${screening.trigger}`}>
                            <Table.Td>{screening.trade_date}</Table.Td>
                            <Table.Td>{screening.trigger}</Table.Td>
                            <Table.Td>{screening.passed_count}</Table.Td>
                            <Table.Td>{screening.selected_codes || "--"}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        ) : (
          <Alert color="gray" variant="light">
            左侧选择一次历史回测，或者直接点击顶部“运行回测”。
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
