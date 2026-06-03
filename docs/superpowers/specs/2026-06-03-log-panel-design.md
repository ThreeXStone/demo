# 前端日志面板 — 设计文档

## 目标

在对话页面通知按钮旁增加日志按钮，点击打开右侧滑出面板，实时显示后端 `console.log` 输出。日志不持久化。

## 架构

```
后端 (NestJS)                          前端 (Next.js)
┌──────────────────┐       SSE          ┌──────────────────┐
│ console.log ──┐  │  ←───────────────  │  LogPanel 组件    │
│ console.error ─┤  │  /chat/logs/stream │  右侧滑出面板     │
│ console.warn ──┼──┤                    │  EventSource 连接 │
│               ▼  │                    │  级别过滤         │
│        内存环形缓冲│                    │                  │
│       (最多500条) │                    │  日志按钮(通知旁)  │
└──────────────────┘                    └──────────────────┘
```

## 后端

### 1. `logging/logging.interceptor.ts` — 日志捕获

- 启动时劫持 `console.log`/`console.error`/`console.warn`
- 保留原始 console 方法（日志仍输出到终端）
- 每条日志写入内存环形缓冲区（最多 500 条，超出删最旧的）
- 每条日志包含：`{ id, level, message, timestamp }`
- 通过 `EventEmitter` 通知监听者有新日志
- 导出 `getRecentLogs()` 获取缓冲区

### 2. `logging/logs.controller.ts` — SSE 端点

- `GET /chat/logs/stream` — SSE 流
- 连接时先发送缓冲区所有日志（历史回放）
- 之后有新日志实时推送（`data: { ... }\n\n`）
- 可选 `?level=error` 过滤

### 3. `app.module.ts` — 注册

- 注册 `LogsController`

## 前端

### 1. `LogPanel.tsx` — 日志面板组件

- 接口同 `NotificationPanel`：`{ open, onToggle }`
- 用 `EventSource` 连接 `/chat/logs/stream`
- `open` 时建立连接，关闭时断开
- 日志顶部显示级别过滤按钮（全部/错误/警告/信息）
- 每条日志：时间 + 级别标签 + 消息文本
- 自动滚动到底部

### 2. `page.tsx` — 集成

- 新增 `logOpen` 状态
- 新增 `LogPanel` 渲染
- 将 `onToggleLog` 传给 `UnifiedChat`

### 3. `UnifiedChat.tsx` — 日志按钮

- 新增 `onToggleLog` prop
- header 中通知按钮旁增加日志按钮（终端图标）

## 边界情况

- **刷新页面**：SSE 重连 → 后端发回缓冲区日志 → 面板恢复
- **切换对话**：日志是全局的，不受影响
- **后端重启**：内存清空，日志从头开始
- **SSE 断连**：不自动重连（只有打开面板时才连），减少无意义请求
- **空日志**：显示"暂无日志"
