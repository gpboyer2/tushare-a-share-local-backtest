/**
 * @fileoverview
 * Express 后端的历史回测服务层，负责承接控制器请求并组织具体业务实现。
 *
 * 主要职责：
 * - 对外暴露：loadHistoricalRun、listHistoricalRuns、formatRunLabel、summary。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装与 Python 脚本、文件系统、历史结果或数据库桥接相关的业务动作。
 * - 对控制器隐藏底层执行细节和错误处理约定。
 * - 输出适合 API 层消费的结构化结果。
 */

import path from "node:path";
import { OUTPUTS_DIR } from "../config/paths.mjs";
import { fs, readJson, safeExists } from "../lib/file-system.mjs";

export function formatRunLabel(runId) {
  const match = /^(\d{8})_(\d{6})$/.exec(runId);

  if (!match) {
    return runId;
  }

  const [, dateValue, timeValue] = match;
  return `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)} ${timeValue.slice(0, 2)}:${timeValue.slice(2, 4)}:${timeValue.slice(4, 6)}`;
}

export async function loadHistoricalRun(runId) {
  const outputDir = path.join(OUTPUTS_DIR, runId);

  if (!(await safeExists(outputDir))) {
    return null;
  }

  const resultJsonPath = path.join(outputDir, "result.json");
  const summaryJsonPath = path.join(outputDir, "summary.json");
  const summary = (await safeExists(resultJsonPath))
    ? (await readJson(resultJsonPath)).summary
    : ((await safeExists(summaryJsonPath)) ? await readJson(summaryJsonPath) : null);

  let detail = null;
  if (await safeExists(resultJsonPath)) {
    detail = await readJson(resultJsonPath);
  }

  return {
    id: runId,
    status: "finished",
    label: formatRunLabel(runId),
    startedAt: formatRunLabel(runId),
    finishedAt: formatRunLabel(runId),
    summary,
    result: detail,
    logs: [],
    outputDir,
    error: "",
  };
}

export async function listHistoricalRuns(limit = 12) {
  if (!(await safeExists(OUTPUTS_DIR))) {
    return [];
  }

  const entries = await fs.readdir(OUTPUTS_DIR, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, limit);

  const runs = [];
  for (const runId of directories) {
    const historicalRun = await loadHistoricalRun(runId);
    if (historicalRun) {
      runs.push({
        id: historicalRun.id,
        status: historicalRun.status,
        label: historicalRun.label,
        startedAt: historicalRun.startedAt,
        finishedAt: historicalRun.finishedAt,
        summary: historicalRun.summary,
      });
    }
  }

  return runs;
}
