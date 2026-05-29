# 项目概览

## 项目结构
这是一个基于 Turbo 的 monorepo 项目，使用 Bun 作为包管理器。

```
.
├── clients/           # 前端客户端
│   └── web/          # Next.js Web 应用
├── services/         # 后端服务
│   └── api/          # NestJS API 服务
│       ├── src/
│       │   ├── config/      # 配置文件
│       │   ├── llm/         # LLM 模块（controller/service）
│       │   │   ├── memory/  # Memory 相关服务
│       │   ├── main.ts      # 入口文件
│       │   └── app.module.ts
├── packages/         # 共享包
├── infra/            # 基础设施
└── .claude/          # Claude 配置和记忆
```

## 常用命令

```bash
# 开发所有服务
bun run dev

# 构建所有项目
bun run build

# 类型检查
bun run typecheck

# 单独启动 API 服务
cd services/api && bunx ts-node src/main.ts
```

## 已实现功能

### LLM 模块 (services/api/src/llm/)

1. **基础 LLM 服务** - `LlmService`
2. **需求结构化抽取** - `RequirementService`
3. **多轮对话 Memory** - `RunnableMemoryService`
   - `POST /api/memory/chat` - 发送消息
   - `GET /api/memory/history?sessionId=xxx` - 获取历史
   - `DELETE /api/memory/clear?sessionId=xxx` - 清除会话

## 技术栈

- 前端：Next.js
- 后端：NestJS
- LLM 框架：LangChain (@langchain/core, @langchain/openai)
- 包管理：Bun
- 构建：Turbo



## Git 提交规范

所有 git commit 必须遵循 Conventional Commits 格式：
`<type>(<scope>): <简短描述>`

### 类型（type）
- feat：新功能
- fix：修复 Bug
- docs：文档变更
- style：格式调整（不影响逻辑）
- refactor：重构
- test：测试相关
- chore：构建/依赖/工具

### 要求
- 描述用中文，简洁清晰，不超过 50 字
- 提交前自动检查是否有未暂存的文件
- 不要用 `git add .`，要明确指定文件或目录
- 重要变更需在 commit body 里补充说明原因

## Git 工作流偏好

- 提交前先用 `git diff --staged` 给我看改动摘要，确认后再提交
- 涉及多个功能点时，拆分成多个小 commit，不要一次性全提交
- 合并前检查是否需要 rebase


---

## 踩过的坑

<!-- LangChain Memory 实现 (2026-05-24) -->
- ❌ 错误做法：`import { trimMessages } from '@langchain/core/runnables'`
  ✅ 正确做法：`import { trimMessages } from '@langchain/core/messages'`
  📌 原因：LangChain 的 trimMessages 定义在 messages 模块，不是 runnables

- ❌ 错误做法：直接在链中调用 trimMessages
  ✅ 正确做法：用 RunnablePassthrough.assign 包装
  📌 原因：trimMessages 需要处理 history 数组后再传入 prompt，不能直接 pipe

- ❌ 错误做法：`@Delete('clear') async clear(@Body() body: ClearRequest)`
  ✅ 正确做法：`@Delete('clear') async clear(@Query('sessionId') sessionId: string)`
  📌 原因：HTTP DELETE 请求通过 URL 查询参数传递数据，@Body() 接收不到

- ❌ 错误做法：每次修改都 `bun run dev` 后台启动，频繁遇到 EADDRINUSE
  ✅ 正确做法：先用 `bun run build` 检查编译错误，确认无误后再启动服务
  📌 原因：编译错误会导致启动失败，留下僵尸进程占用端口

<!-- 文件系统工具实现 (2026-05-24) -->
- ❌ 错误做法：使用 promises fs (fs.readFile, fs.mkdir) 和复杂的返回值结构
  ✅ 正确做法：使用同步 fs (fs.readFileSync, fs.mkdirSync) 和简洁的返回值
  📌 原因：LangChain 工具本身就是 async 的，内部用同步即可，示范代码风格更简洁

- ❌ 错误做法：返回值包装 found/success/message 等字段
  ✅ 正确做法：直接返回数据或 { error: string }
  📌 原因：过多的包装字段增加复杂度，模型理解更困难

- ❌ 错误做法：在工具中添加 ensureWorkspace 自动创建目录
  ✅ 正确做法：按需创建，writeFile 时自动创建父目录即可
  📌 原因：read 操作不应自动创建目录，避免误操作

<!-- 向量化能力接入 (2026-05-25) -->
- ❌ 错误做法：`import { MemoryVectorStore } from 'langchain/vectorstores/memory'`
  ✅ 正确做法：手动实现简单的内存向量存储
  📌 原因：LangChain 1.4.2 版本中没有 MemoryVectorStore，包结构分散

- ❌ 错误做法：使用 HuggingFaceTransformersEmbeddings 下载远程模型
  ✅ 正确做法：使用 mock embedding 或确认网络环境支持
  📌 原因：HuggingFaceTransformersEmbeddings 初始化时会下载模型，网络请求可能失败

- ❌ 错误做法：遗漏安装 @huggingface/transformers 依赖
  ✅ 正确做法：仔细检查运行时错误日志，补充缺失依赖
  📌 原因：@langchain/community 的 HuggingFaceTransformersEmbeddings 依赖 @huggingface/transformers

<!-- Next.js Rewrites 代理 (2026-05-28) -->
- ❌ 错误做法：`source: "/api/:path*"` → `destination: "http://localhost:3001/:path*"`
  ✅ 正确做法：`destination: "http://localhost:3001/api/:path*"`
  📌 原因：Next.js rewrites 中 `:path*` 只捕获 `/api/` 之后的部分（不包含 `/api/`），目的地必须显式加上 `/api/` 前缀，否则 NestJS 的 `@Controller('api/...')` 路由匹配不上

<!-- NestJS 热更新 (2026-05-28) -->
- ❌ 错误做法：新增 NestJS Controller/Service 后不重启服务就直接测试
  ✅ 正确做法：每次新增文件后重启 API 服务（`ts-node` 不会自动扫描新文件）
  📌 原因：`ts-node` + NestJS 只监听已有文件的变更，不会监听新增文件的创建，新建的 Controller 路由不会注册

<!-- Multer 中文文件名 (2026-05-28) -->
- ❌ 错误做法：`file.originalname` 直接用于文件名存储和入库
  ✅ 正确做法：`const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')`
  📌 原因：Multer 默认使用 latin1 解码 multipart 中的文件名，中文等非 ASCII 字符会乱码，需要手动转为 utf8

<!-- @xenova/transformers 模型加载 (2026-05-29) -->
- ❌ 错误做法：`pipeline('feature-extraction', 'Xenova/...')` 不设任何选项，依赖网络自动下载
  ✅ 正确做法：先用 curl/hf-mirror 下载 ONNX 模型到 `node_modules/@xenova/transformers/models/<model-name>/`，再用 `local_files_only: true`
  📌 原因：`@xenova/transformers` 内部 fetch 不走系统代理，网络受限环境下模型下载失败；模型缓存路径不是 `~/.cache/huggingface`，而是 `node_modules/@xenova/transformers/models/`

<!-- OpenAI Structured Output 限制 (2026-05-29) -->
- ❌ 错误做法：使用 `z.discriminatedUnion('type', [...])` 或 `z.union([...])` 定义 Schema 传给 `withStructuredOutput()`
  ✅ 正确做法：平铺所有字段到单一 object，每个字段都有 `.describe()`，去掉 `.optional()` 改用空字符串默认值
  📌 原因：OpenAI structured output API 不支持 `oneOf`/`anyOf`/`$ref`/`propertyNames`，且所有 properties 必须在 `required` 数组中。DeepSeek 完全不支持 structured output

<!-- DeepSeek API 与 Structured Output (2026-05-29) -->
- ❌ 错误做法：对 DeepSeek 使用 `withStructuredOutput()` 或 `response_format`
  ✅ 正确做法：Prompt 中要求返回 JSON → model.invoke() → 正则提取 JSON → Zod 客户端校验
  📌 原因：DeepSeek 不支持 OpenAI 的 response_format（jsonSchema 和 functionCalling 都报 "unavailable"），但 `z.discriminatedUnion` 可以用在客户端校验阶段

<!-- Zod v4 兼容性 (2026-05-29) -->
- ❌ 错误做法：`z.record(z.string())` 只传一个参数
  ✅ 正确做法：`z.record(z.string(), z.string())` 两个参数分别指定 key 和 value 的 schema
  📌 原因：Zod v4 的 record() 签名变更，必须同时提供 key schema 和 value schema

<!-- SSE 流式响应 (2026-05-29) -->
- ❌ 错误做法：在 NestJS 普通 `@Post()` 中 `return` 流式数据
  ✅ 正确做法：`@Res() res: any` 接管响应 → `res.setHeader('Content-Type', 'text/event-stream')` → `res.flushHeaders()` → `res.write(formatSSE(...))` → `res.end()`
  📌 原因：NestJS 默认将返回值序列化为 JSON 一次发送完毕，SSE 需要手动控制 response 对象的生命周期

<!-- React setInterval 闭包 (2026-05-29) -->
- ❌ 错误做法：`setInterval(poll, 3000)` 中 poll 依赖 state 变量（通过 useCallback）
  ✅ 正确做法：用 `useRef` 存储变化值（如 lastSeen），poll 函数内直接读 ref.current
  📌 原因：setInterval 捕获的闭包永远是第一次渲染时的值，即使 useCallback 依赖项变化重新创建 poll，定时器仍在调用旧函数

<!-- 多服务端口冲突 (2026-05-29) -->
- ❌ 错误做法：`bun run dev` 在 monorepo 根目录或 services/api 下，不确定启动的是哪个服务
  ✅ 正确做法：明确路径和命令——API 用 `bunx ts-node src/main.ts`（3001），Chat 用同命令（3002），前端用 `bun run dev`（各自端口）
  📌 原因：monorepo 的 `bun run dev` 可能触发 Turbo pipeline，同时启动多个服务导致端口抢占。先启动后端，再启动前端

<!-- Prisma v7 驱动适配器 (2026-05-29) -->
- ❌ 错误做法：`new PrismaClient()` 无参或 `super({ datasources: { db: { url } } })`
  ✅ 正确做法：`super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`
  📌 原因：Prisma v7 移除内嵌引擎，必须通过 `@prisma/adapter-pg` 提供运行时数据库连接

<!-- DeepSeek API 稳定性问题 (2026-05-29) -->
- ❌ 错误做法：对 DeepSeek 使用 `withStructuredOutput()` 或信任 `model.invoke()` 永远会返回
  ✅ 正确做法：
    1. 分类路由用关键词匹配替代 LLM 调用（正则判断意图，不调模型）
    2. 每个 `model.invoke()` 包裹 try-catch + 兜底消息
    3. HTTP 层设 25s 超时（`configuration: { timeout: 25_000 }`）
    4. 默认意图设为 `chat`（避免未识别输入触发 5 节点管道挂死）
  📌 原因：DeepSeek API 有间歇性"静默挂死"问题——TCP 连接建立后无响应，Promise 既不 resolve 也不 reject，导致 SSE 流永久卡住。`Promise.race` 无法中断底层 HTTP 请求，LangChain 的 `timeout` 参数不会传给 OpenAI SDK
