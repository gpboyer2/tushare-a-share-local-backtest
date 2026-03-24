/**
 * @fileoverview
 * React 的工作台右侧配置检查面板，负责工作台中的局部界面区域与对应交互。
 *
 * 主要职责：
 * - 对外暴露：InspectorPanel。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 接收父级状态并渲染局部 UI。
 * - 围绕工作台资源、编辑、检查或结果区域组织交互。
 */

import { Button, Group, NumberInput, Paper, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import type { ConfigFormGroup } from "@contracts/workbench";

type InspectorPanelProps = {
  groups: ConfigFormGroup[];
  onFieldChange: (path: string, value: string | number | boolean, type: string) => void;
  onReset: () => void;
};

export function InspectorPanel({ groups, onFieldChange, onReset }: InspectorPanelProps) {
  return (
    <Paper withBorder radius="lg" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={4}>参数区</Title>
            <Text size="xs" c="dimmed">修改后直接驱动真实回测配置</Text>
          </Stack>
          <Button size="compact-xs" variant="subtle" color="orange" onClick={onReset}>
            重置
          </Button>
        </Group>

        <Stack gap="xs">
          {groups.map((group) => (
            <Paper key={group.id} withBorder radius="md" p="xs">
              <Stack gap="xs">
                <Stack gap={0}>
                  <Text fw={600} size="sm">{group.title}</Text>
                  <Text size="xs" c="dimmed">{group.fields.length} 项</Text>
                </Stack>
                <Stack gap="xs">
                  {group.fields.map((field) => (
                    <div key={field.path} className="inspector-field">
                      <div className="inspector-field__meta">
                        <Text fw={600} size="xs">{field.label}</Text>
                        <Text size="xs" c="dimmed">{field.description}</Text>
                      </div>
                      {field.type === "boolean" ? (
                        <Switch
                          size="sm"
                          checked={Boolean(field.value)}
                          onChange={(event) => onFieldChange(field.path, event.currentTarget.checked, field.type)}
                          onLabel="开"
                          offLabel="关"
                        />
                      ) : field.type === "number" ? (
                        <NumberInput
                          size="xs"
                          value={typeof field.value === "number" || typeof field.value === "string" ? field.value : ""}
                          step={field.step}
                          onChange={(value) => onFieldChange(field.path, value, field.type)}
                        />
                      ) : (
                        <TextInput
                          size="xs"
                          type={field.type === "date" ? "date" : "text"}
                          value={String(field.value)}
                          onChange={(event) => onFieldChange(field.path, event.currentTarget.value, field.type)}
                        />
                      )}
                    </div>
                  ))}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
