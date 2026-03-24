/**
 * @fileoverview
 * 浏览器 smoke 验证脚本，负责通过浏览器自动化串联前端关键交互并留存验收痕迹。
 *
 * 主要职责：
 * - 对外暴露：logStep、saveScreenshot、waitForSuccessMessage、waitForApiSuccess、fillInspectorField、ensureRunButtonEnabled、run。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 驱动页面访问、表单填写、回测发起、数据库写探针等关键流程。
 * - 在关键步骤输出日志并按需截图。
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "..", "..");
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8788/#/workbench";
const outputDir = process.env.SMOKE_OUTPUT_DIR || path.join(WORKSPACE_ROOT, "outputs", "browser-smoke", timestamp);

function logStep(message, payload = undefined) {
  if (payload === undefined) {
    console.log(`[browser-smoke] ${message}`);
    return;
  }
  console.log(`[browser-smoke] ${message}`, payload);
}

async function saveScreenshot(page, name) {
  const filePath = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  logStep(`saved screenshot: ${filePath}`);
}

async function waitForSuccessMessage(page, text) {
  await page.getByText(text, { exact: true }).waitFor({ state: "visible", timeout: 15000 });
}

async function waitForApiSuccess(page, apiPath, trigger) {
  const [response] = await Promise.all([
    page.waitForResponse((currentResponse) => currentResponse.url().includes(apiPath), {
      timeout: 40000,
    }),
    trigger(),
  ]);
  const payload = await response.json();
  if (!response.ok() || payload?.status !== "success") {
    throw new Error(`${apiPath} failed: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function fillInspectorField(page, fieldLabel, value) {
  const field = page.locator(".inspector-field").filter({ hasText: fieldLabel }).first();
  await field.waitFor({ state: "visible", timeout: 15000 });
  await field.locator("input").first().fill(String(value));
}

async function ensureRunButtonEnabled(page) {
  const runButton = page.getByRole("button", { name: "运行回测" });
  if (await runButton.isEnabled()) {
    return;
  }

  logStep("run button disabled, switch to a finished run first");
  const finishedRunButton = page.locator(".resource-item").filter({ hasText: "finished" }).first();
  await finishedRunButton.waitFor({ state: "visible", timeout: 15000 });
  await finishedRunButton.click();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await runButton.isEnabled()) {
      return;
    }
    await page.waitForTimeout(500);
  }

  throw new Error("运行回测按钮在切换到已完成任务后仍未恢复可点击状态。");
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
  });
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    logStep("open workbench", { baseUrl });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "运行回测" }).waitFor({ state: "visible", timeout: 20000 });
    await page.getByText("策略编辑区").waitFor({ state: "visible", timeout: 15000 });
    await saveScreenshot(page, "01-workbench-loaded");
    await ensureRunButtonEnabled(page);

    logStep("prepare short backtest parameters");
    await fillInspectorField(page, "开始日期", "2023-01-03");
    await fillInspectorField(page, "结束日期", "2023-01-05");
    await fillInspectorField(page, "展示候选数", "5");
    await fillInspectorField(page, "自动买入数", "1");
    await fillInspectorField(page, "目标持仓数", "1");
    await saveScreenshot(page, "02-workbench-params-updated");

    logStep("trigger backtest from browser");
    await page.getByRole("button", { name: "运行回测" }).click();
    await page.waitForURL(/#\/backtests\/detail\?run_id=/, { timeout: 20000 });
    await page.getByRole("heading", { name: "回测详情" }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByText("任务已创建，等待执行。", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
    await saveScreenshot(page, "03-backtest-detail-running");

    logStep("switch to a finished run for result tabs");
    const finishedRunButton = page.locator(".resource-item").filter({ hasText: "finished" }).first();
    await finishedRunButton.waitFor({ state: "visible", timeout: 15000 });
    await finishedRunButton.click();
    await page.getByText("结果区").waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("tab", { name: "收益曲线" }).click();
    await page.getByRole("tab", { name: "订单明细" }).click();
    await page.getByRole("tab", { name: "筛选记录" }).click();
    await saveScreenshot(page, "04-backtest-result-tabs");

    logStep("navigate to database page");
    await page.getByRole("button", { name: "数据库管理" }).click();
    await page.waitForURL(/#\/database/, { timeout: 15000 });
    await page.getByRole("heading", { name: "数据库概览" }).waitFor({ state: "visible", timeout: 15000 });
    await page.locator(".database-table-item").filter({ hasText: "__write_probe" }).first().click();
    await page.getByText("当前表: __write_probe").waitFor({ state: "visible", timeout: 15000 });
    await saveScreenshot(page, "05-database-write-probe");

    logStep("execute safe SQL query");
    await page.getByRole("tab", { name: "SQL 执行" }).click();
    await page.locator("textarea").fill("SELECT * FROM __write_probe ORDER BY id DESC LIMIT 5");
    await page.getByRole("button", { name: "执行 SQL" }).click();
    await waitForSuccessMessage(page, "SQL 查询成功。");
    await saveScreenshot(page, "06-database-sql");

    const probeValue = `pw-smoke-${Date.now()}`;
    const updatedProbeValue = `${probeValue}-updated`;
    const formPanel = page.locator('[data-debug-panel="form"]');

    logStep("create row via browser form", { probeValue });
    await page.getByRole("tab", { name: "数据操作" }).click();
    await formPanel.waitFor({ state: "visible", timeout: 10000 });
    await formPanel.getByRole("button", { name: "新建记录" }).click();
    await formPanel.getByLabel("note").fill(probeValue);
    await waitForApiSuccess(page, "/api/database/row/create", () =>
      formPanel.getByRole("button", { name: "新增记录" }).click(),
    );

    logStep("search created row");
    await page.getByRole("tab", { name: "数据浏览" }).click();
    await page.getByPlaceholder("关键字搜索").fill(probeValue);
    await page.getByRole("button", { name: "筛选" }).click();
    await page.getByText(probeValue, { exact: true }).waitFor({ state: "visible", timeout: 15000 });
    const createdRow = page.locator("tbody tr").filter({ hasText: probeValue }).first();

    logStep("edit row via browser form", { updatedProbeValue });
    await createdRow.getByRole("button", { name: "编辑" }).click();
    await formPanel.getByText("编辑当前记录", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    const noteInput = formPanel.locator("input").nth(1);
    if ((await noteInput.inputValue()) !== probeValue) {
      throw new Error("编辑表单未正确回填 note 字段。");
    }
    await noteInput.fill(updatedProbeValue);
    await waitForApiSuccess(page, "/api/database/row/update", () =>
      formPanel.getByRole("button", { name: "保存修改" }).click(),
    );

    logStep("confirm updated row");
    await page.getByRole("tab", { name: "数据浏览" }).click();
    await page.getByPlaceholder("关键字搜索").fill(updatedProbeValue);
    await page.getByRole("button", { name: "筛选" }).click();
    await page.getByText(updatedProbeValue, { exact: true }).waitFor({ state: "visible", timeout: 15000 });

    logStep("delete selected row");
    await page.locator("thead input[type='checkbox']").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("tbody input[type='checkbox']").first().click();
    await waitForApiSuccess(page, "/api/database/row/delete", () =>
      page.getByRole("button", { name: "删除选中" }).click(),
    );
    await page.getByText(updatedProbeValue, { exact: true }).waitFor({ state: "detached", timeout: 15000 });
    await saveScreenshot(page, "07-database-crud");

    const summary = {
      baseUrl,
      outputDir,
      consoleErrors,
      pageErrors,
      finalUrl: page.url(),
      createdProbeValue: probeValue,
      updatedProbeValue,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("[browser-smoke] failed", error);
  process.exitCode = 1;
});
