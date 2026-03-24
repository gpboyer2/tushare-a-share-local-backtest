/**
 * @fileoverview
 * Express 后端的回测任务运行时存储模块，负责在进程内保存任务状态与查询入口。
 *
 * 主要职责：
 * - 对外暴露：setJob、getJob、listJobs、getActiveJobCount。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 维护任务对象的增删查改。
 * - 为回测创建、轮询和日志追踪提供进程级状态容器。
 */

const jobs = new Map();

export function setJob(job) {
  jobs.set(job.id, job);
  return job;
}

export function getJob(runId) {
  return jobs.get(runId) || null;
}

export function listJobs() {
  return Array.from(jobs.values());
}

export function getActiveJobCount() {
  return Array.from(jobs.values()).filter((job) => job.status === "queued" || job.status === "running").length;
}
