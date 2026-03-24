/**
 * @fileoverview
 * 前端的前端配置读写工具模块，负责提供被页面和组件复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：getConfigValue、setConfigValue、hydrateFormGroups。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 负责工作台配置数据的读写和表单映射。
 * - 把嵌套配置结构转换为页面可编辑形态。
 */

import type { BacktestConfig, ConfigFormGroup } from "@contracts/workbench";

export function getConfigValue(config: BacktestConfig, path: string) {
  return path.split(".").reduce((acc, key) => (acc as Record<string, unknown>)?.[key], config as unknown);
}

export function setConfigValue<T extends BacktestConfig>(config: T, path: string, value: unknown): T {
  const next = structuredClone(config);
  const segments = path.split(".");
  let cursor: Record<string, unknown> = next as unknown as Record<string, unknown>;

  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = cursor[segments[index]] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value;
  return next;
}

export function hydrateFormGroups(groups: ConfigFormGroup[], config: BacktestConfig): ConfigFormGroup[] {
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({
      ...field,
      value: getConfigValue(config, field.path) as string | number | boolean,
    })),
  }));
}
