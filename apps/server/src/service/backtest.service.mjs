/**
 * @fileoverview
 * Express 后端的回测服务层，负责承接控制器请求并组织具体业务实现。
 *
 * 主要职责：
 * - 对外暴露：listBacktestRuns、createBacktestRun、getBacktestRunDetail、serializeJob、createRunId、appendJobLog、createBacktestJob。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装与 Python 脚本、文件系统、历史结果或数据库桥接相关的业务动作。
 * - 对控制器隐藏底层执行细节和错误处理约定。
 * - 输出适合 API 层消费的结构化结果。
 */

import path from "node:path";
import { spawn } from "node:child_process";
import { PROJECT_ROOT, PYTHON_BRIDGE_PATH, TMP_DIR } from "../config/paths.mjs";
import { createBadRequestError, createNotFoundError } from "../lib/http-error.mjs";
import { detectPythonExecutable } from "../lib/python-bridge.mjs";
import { fs, readJson, writeJson } from "../lib/file-system.mjs";
import { getJob, listJobs, setJob } from "../runtime/job-store.mjs";
import { formatRunLabel, listHistoricalRuns, loadHistoricalRun } from "./backtest-history.service.mjs";
import { loadDefaultConfig, normalizeConfig, validateConfig } from "./workbench.service.mjs";

function createRunId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
}

export function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    label: formatRunLabel(job.id),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    summary: job.summary,
    result: job.result,
    logs: job.logs,
    error: job.error,
    outputDir: job.outputDir,
    config: job.config,
  };
}

export async function listBacktestRuns() {
  const history = await listHistoricalRuns();
  const activeJobs = listJobs()
    .map((job) => serializeJob(job))
    .sort((left, right) => right.id.localeCompare(left.id));

  const mergedMap = new Map();
  for (const item of [...activeJobs, ...history]) {
    if (!mergedMap.has(item.id)) {
      mergedMap.set(item.id, item);
    }
  }

  return { items: Array.from(mergedMap.values()) };
}

function appendJobLog(job, message, stream = "stdout") {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    job.logs.push({
      time: new Date().toISOString(),
      message: stream === "stderr" ? `[stderr] ${line}` : line,
    });
  }
}

async function createBacktestJob(config) {
  const runId = createRunId();
  const runtimeDir = path.join(TMP_DIR, runId);
  const configPath = path.join(runtimeDir, "config.json");
  const resultPath = path.join(runtimeDir, "result.json");
  const job = setJob({
    id: runId,
    status: "queued",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    summary: null,
    result: null,
    logs: [{ time: new Date().toISOString(), message: "任务已创建，等待执行。" }],
    error: "",
    outputDir: "",
    config,
  });

  await fs.mkdir(runtimeDir, { recursive: true });
  await writeJson(configPath, config);

  const pythonExecutable = detectPythonExecutable();
  const child = spawn(
    pythonExecutable,
    [PYTHON_BRIDGE_PATH, "--config", configPath, "--result-json", resultPath, "--run-id", runId],
    {
      cwd: PROJECT_ROOT,
      env: process.env,
    },
  );

  job.status = "running";
  job.logs.push({ time: new Date().toISOString(), message: `使用 ${pythonExecutable} 启动 Python 回测。` });

  child.stdout.on("data", (chunk) => {
    appendJobLog(job, chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    appendJobLog(job, chunk.toString(), "stderr");
  });

  child.on("error", (error) => {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = error.message;
    job.logs.push({ time: new Date().toISOString(), message: `任务启动失败: ${error.message}` });
  });

  child.on("close", async (code) => {
    job.finishedAt = new Date().toISOString();

    if (code !== 0) {
      job.status = "failed";
      job.error = `Python 回测进程退出码 ${code}`;
      job.logs.push({ time: new Date().toISOString(), message: job.error });
      return;
    }

    try {
      const result = await readJson(resultPath);
      job.status = "finished";
      job.result = result;
      job.summary = result.summary;
      job.outputDir = result.output_dir;
      job.logs.push({ time: new Date().toISOString(), message: `任务完成，结果已写入 ${result.output_dir}` });
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.logs.push({ time: new Date().toISOString(), message: `结果读取失败: ${job.error}` });
    }
  });

  return job;
}

export async function createBacktestRun(payload) {
  const defaultConfig = await loadDefaultConfig();
  const mergedConfig = normalizeConfig({
    ...defaultConfig,
    ...payload.config,
    backtest: { ...defaultConfig.backtest, ...(payload.config?.backtest || {}) },
    strategy: { ...defaultConfig.strategy, ...(payload.config?.strategy || {}) },
    optional_endpoints: { ...defaultConfig.optional_endpoints, ...(payload.config?.optional_endpoints || {}) },
  });

  const validationError = validateConfig(mergedConfig);
  if (validationError) {
    throw createBadRequestError(validationError);
  }

  const job = await createBacktestJob(mergedConfig);
  return serializeJob(job);
}

export async function getBacktestRunDetail(runId) {
  if (!runId) {
    throw createBadRequestError("缺少 run_id 参数");
  }

  const activeJob = getJob(runId);
  if (activeJob) {
    return serializeJob(activeJob);
  }

  const historicalRun = await loadHistoricalRun(runId);
  if (!historicalRun) {
    throw createNotFoundError("未找到对应回测结果");
  }

  return historicalRun;
}
