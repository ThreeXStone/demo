# Chat 服务

## 常用命令

```bash
cd services/chat && bunx ts-node --transpile-only src/main.ts  # 启动 (端口 3002)
cd services/chat && bunx prisma generate                        # 生成 Prisma Client
cd services/chat && bunx tsc --noEmit                          # 类型检查
```

## 架构

```
UIChatController (HTTP/SSE 适配, ~400行)
  ├── OrchestratorService  (编排层)
  │     ├── orchestrate()          → runAnalysisGraph
  │     ├── streamOrchestrate()    → streamAnalysisGraph (AsyncGenerator)
  │     └── asRunnable()           → RunnableLambda
  ├── model.factory.ts     (模型工厂, 统一创建 + 缓存)
  ├── ui-types.ts          (流事件类型)
  └── ui-action.parser.ts  (UI 操作解析)
```

---

## 踩过的坑

### LangChain
- `trimMessages` 从 `@langchain/core/messages` 导入，不是 `runnables`；用 `RunnablePassthrough.assign` 包装
- LangChain 1.4.2 没有 `MemoryVectorStore` — 手动实现内存向量存储；HuggingFaceTransformersEmbeddings 初始化下载模型可能失败，用 mock embedding
- `@xenova/transformers` 模型缓存路径是 `node_modules/@xenova/transformers/models/`，不是 `~/.cache/huggingface`；用 `local_files_only: true` 避免自动下载

### NestJS
- HTTP DELETE 用 `@Query()` 取参数，不是 `@Body()`；SSE 需 `@Res()` 接管响应，手动 `res.write()`/`res.end()`

### Prisma v7
- 必须用 `adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })`，不能无参 `new PrismaClient()`

### 文件系统工具
- LangChain 工具内部用同步 fs，直接返回数据或 `{ error: string }`；writeFile 时按需创建父目录，read 不自动创建

### LangGraph
- clarify 模式下 `classifierNode` 检测 `state.clarifyAnswer` 存在则直接返回 `intent: 'analyze'`，跳过 LLM 分类
- streamEvents v2 中顶层图完成事件不含 "StateGraph" — 在 `on_chain_end` 累积各节点 partial state
- `on_chat_model_stream` 捕获所有 LLM 调用 — 定义 `SKIP_TOKEN_NODES` 对 JSON 输出/invoke-only/子图节点不推送 token
- clarify 完成时也要持久化 plan（`else if (!needsClarification && questions.length > 0)` 分支），不能只在 `needsClarification === true` 时存

### 数据持久化
- AI UI 组件序列化到 Message 表 `metadata Json?` 字段，刷新后从 `metadata.components` 还原
- `handleAction` 响应也调用 `saveMessage`，metadata 附带 `actionPayload`
