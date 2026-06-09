# Chat Web 前端

## 常用命令

```bash
cd clients/chat-web && bun run dev  # 启动前端 (端口 3003)
cd clients/chat-web && bunx tsc --noEmit  # 类型检查
```

---

## 踩过的坑

### React
- `setInterval` 闭包陷阱 — 用 `useRef` 存储变化值，poll 内读 `ref.current`，不依赖 useCallback
- clarify_answer 标注逻辑在 `await handleSSE()` 之前同步执行（无条件），aiMsg 追加在请求返回后单独处理

### SSE 流处理
- `reader.read()` 返回 `done: true` 时先处理 buffer 残留行再 break — TCP 分片可能切碎最后一条 SSE `data:` 行

### 状态恢复
- 刷新后 `loadMessages` 检测历史中未回答的 `clarify_question` 自动恢复 `isInClarifyMode = true`
- 加载历史时从 `metadata.components` 还原 UI 组件，结合 system 消息的 `clarify_plan` 标注状态

### Next.js Rewrites
- `destination` 必须显式加 `/api/` 前缀 — `:path*` 只捕获 `/api/` 之后的部分
