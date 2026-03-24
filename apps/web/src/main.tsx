/**
 * @fileoverview
 * 前端的前端入口引导模块。
 *
 * 主要职责：
 * - 对外暴露：模块级常量、类型或默认导出。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 负责 React 应用初始化、路由装配或页面壳层组织。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";
import "./styles/index.css";

const theme = createTheme({
  primaryColor: "orange",
  defaultRadius: "lg",
  fontFamily: "\"MiSans\", \"PingFang SC\", \"Microsoft YaHei\", \"Helvetica Neue\", Arial, sans-serif",
  headings: {
    fontFamily: "\"MiSans\", \"PingFang SC\", \"Microsoft YaHei\", \"Helvetica Neue\", Arial, sans-serif",
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
