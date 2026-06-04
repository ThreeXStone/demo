# 项目快速恢复上下文 - 2026-06-04

## 项目概览

这是一个基于 Turbo 的 monorepo 项目，使用 Bun 作为包管理器。

### 技术栈
- 前端：Next.js 15, React 19, Tailwind CSS 4
- 后端：NestJS, LangChain (@langchain/core, @langchain/openai), LangGraph
- 数据库：PostgreSQL + Prisma v7（pg 驱动适配器）
- 认证：JWT（@nestjs/jwt + scryptSync 密码哈希）
- 包管理：Bun
- 构建：Turbo

### 目录结构
```
.
├── clients/chat-web/          # Next.js 前端 (端口 3003)
│   └── src/
│       ├── app/               # 页面 (page.tsx, layout.tsx)
│       ├── components/        # 组件
│       │   └── ai-ui/         # AI UI 组件 (DynamicForm, SelectionCard, StepsProgress 等)
│       └── lib/               # API 客户端 & 类型定义 (api.ts, types.ts)
├── services/chat/             # NestJS 后端 (端口 3002)
│   ├── prisma/
│   │   └── schema.prisma      # 6 模型 (User/Conversation/Message/Document/DocumentChunk/Requirement)
│   ├── src/
│   │   ├── main.ts            # 入口，端口 3002，启用 CORS
│   │   ├── app.module.ts      # 根模块，导入 5 个子模块
│   │   ├── auth/              # JWT 注册/登录
│   │   ├── conversation/      # 对话和消息 CRUD
│   │   ├── document/          # 文件上传、文档管理
│   │   ├── notification/      # 通知查询（骨架）
│   │   ├── logging/           # 日志捕获 & SSE 日志流
│   │   ├── prisma/            # 数据库服务（全局模块）
│   │   └── llm/
│   │       ├── agents/        # LangGraph 子 Agent（extract/clarify/risk/summary）
│   │       ├── graph/         # LangGraph 需求分析图（意图分类 + 分析流水线）
│   │       └── ui-protocol/   # UI Protocol 控制器 & 流程服务 & 需求持久化
│   └── .env                   # 环境变量（API key, DB URL）
├── packages/contracts/        # 共享类型契约
└── infra/compose/             # Docker Compose (PostgreSQL)
```

## 端口分配

| 服务 | 端口 |
|------|------|
| 前端 (Next.js) | 3003 |
| 后端 (NestJS) | 3002 |

## 常用命令

```bash
# 安装依赖 (根目录)
bun install

# 启动后端 (--transpile-only 跳过类型检查)
cd services/chat && bunx ts-node --transpile-only src/main.ts

# 启动前端
cd clients/chat-web && bun run dev

# 生成 Prisma Client
cd services/chat && bunx prisma generate

# 类型检查
cd services/chat && bunx tsc --noEmit
cd clients/chat-web && bunx tsc --noEmit
```

---

## 核心功能模块

### 1. Auth 模块 (`services/chat/src/auth/`)

JWT 注册/登录，密码使用 scryptSync 哈希（salt:hash 格式），timingSafeEqual 防时序攻击。

| 端点 | 功能 |
|---|---|
| `POST /chat/auth/register` | 注册，body: `{ email, password, name? }` → `{ token, user }` |
| `POST /chat/auth/login` | 登录，body: `{ email, password }` → `{ token, user }` |

- AuthModule 是 `@Global()` 模块
- JWT 有效期 7 天，secret 默认 `dev-secret`
- 前端 token 存 localStorage，请求时通过 Authorization header 发送

### 2. Conversation 模块 (`services/chat/src/conversation/`)

简化的对话和消息 CRUD，使用 `ensureUser()` 模式（无 JWT Guard 校验，自动创建/获取默认用户）。

| 方法 | 路由 | 功能 |
|---|---|---|
| POST | `/chat/conversations` | 创建会话，body: `{ title? }` |
| GET | `/chat/conversations` | 获取会话列表 |
| GET | `/chat/conversations/:id/messages` | 获取消息历史 |
| POST | `/chat/conversations/:id/messages` | 手动写消息，body: `{ role, content }` |
| DELETE | `/chat/conversations/:id` | 删除会话（级联消息） |

### 3. Document 模块 (`services/chat/src/document/`)

文件上传和管理，使用 Multer FileInterceptor。

| 端点 | 功能 |
|---|---|
| `POST /chat/documents/upload` | 上传文件（multipart） |
| `GET /chat/documents` | 获取文档列表 |
| `POST /chat/documents/:id/process` | 标记文档为已完成 |
| `DELETE /chat/documents/:id` | 删除文档 |

### 4. UI Protocol 模块 (`services/chat/src/llm/ui-protocol/`)

**SSE 流式 LLM 对话 + 需求收集 + LangGraph 分析**，核心模块。

#### UIChatController 端点 (`/chat/ui-chat`)

| 路由 | 描述 | 流式 |
|---|---|---|
| `POST /chat/ui-chat/chat` | 普通对话（直接调 LLM stream） | SSE |
| `POST /chat/ui-chat/query` | 简洁查询 | SSE |
| `POST /chat/ui-chat/requirement/collect` | 需求收集流程（状态机驱动） | SSE |
| `POST /chat/ui-chat/requirement/action` | 需求收集交互动作 | JSON |
| `POST /chat/ui-chat/analyze` | LangGraph 需求分析（意图分类+流水线） | SSE |

SSE 消息类型（messageType）：
- `markdown` — 流式文本，payload.content 含 isChunk 标记
- `ui` — UI 组件，payload.components 含动态表单/选择卡等
- `progress` — 分析进度，payload.step 和 payload.message
- `done` — 流结束
- `error` — 错误，payload.code + payload.message

每 10 秒发 `: ping\n\n` 心跳保活。

#### UIFlowService（需求收集状态机）

- 四阶段流程：`init` → `select_type`（选择需求类型）→ `fill_detail`（填写表单）→ `confirm`（确认提交）
- 会话状态存内存 Map，支持 goBack 回退
- 确认后调用 RequirementService 持久化到 Requirement 表

#### RequirementService（需求持久化）

- `create(data)` → 写入 Requirement 表（sessionId, reqId, title, type, priority, description, acceptanceCriteria, notes）
- `findBySession(sessionId)` / `findAll()` / `findByReqId(reqId)` 查询

### 5. LangGraph 需求分析图 (`services/chat/src/llm/graph/`)

基于 LangGraph StateGraph 的意图分类 + 分析流水线。

**架构概览**：
```
START → classifier（LLM 意图分类）
  ├── chat → chatHandler（流式对话）→ END
  ├── query → queryHandler（流式查询）→ END
  └── analyze → extractStep → clarifyStep → analysisStep（ReAct子图）→ riskStep → summaryStep → END
```

**三条路径**：
- **chat**：简单流式 LLM 对话（system prompt: "友好的AI助手"）
- **query**：简洁信息查询（system prompt: "需求查询助手"）
- **analyze**：5 节点管线（extract → clarify → ReAct analysis → risk → summary）

**关键节点**：
- `classifierNode`：LLM 调用 → JSON 解析 → Zod 校验 intent。失败兜底 chat
- `analysisStep`：嵌套 ReAct 子图，LLM 可调用 `search_requirement` 工具查询需求编号，最多 6 轮工具循环
- `summaryStep`：流式输出 Markdown 汇总报告

**防挂死措施**：
- 每个 LLM 调用包裹 `withTimeout`（100s 超时），超时抛异常
- 每个节点 try-catch，失败返回兜底消息
- HTTP 层 SSE 心跳 10s，连接断开自动清理

**子 Agent**（`llm/agents/sub-agents.ts`）：
- `createExtractAgent` — 需求信息抽取
- `createClarifyAgent` — 需求澄清
- `createRiskAgent` — 风险评估
- `createSummaryAgent` — 汇总报告

### 6. Logging 模块 (`services/chat/src/logging/`)

- `log-capture.ts`：劫持 `console.log/error/warn`，写入内存环形缓冲（500 条），通过 EventEmitter 推送新日志
- `logs.controller.ts`：SSE 端点 `GET /chat/logs/stream`，先回放缓冲区，再实时推送。连接断开时取消订阅

### 7. Notification 模块 (`services/chat/src/notification/`)

- `GET /chat/notifications` 返回空数组（骨架，尚未实现真实通知逻辑）

---

## 数据库 Schema

```prisma
User          → id, email(@unique), name?, password, role, conversations[], documents[]
Conversation  → id, title, userId, messages[], createdAt, updatedAt
Message       → id, conversationId, role(human|ai|system|tool), content(@db.Text), metadata(Json?)
Document      → id, userId, filename, originalName, mimeType, size, status, chunkCount, chunks[]
DocumentChunk → id, documentId, content, chunkIndex, metadata, embedding(vector(384)?)
Requirement   → id, sessionId, reqId, title, type, priority, description, acceptanceCriteria?, notes?, status, createdAt, updatedAt
```

外键级联：Message.conversationId (onDelete: Cascade), DocumentChunk.documentId (onDelete: Cascade)

## 前端组件 (`clients/chat-web/src/`)

| 文件 | 说明 |
|---|---|
| `app/page.tsx` | 主布局：左侧栏（ConversationList + SidebarDocs）+ 中间 UnifiedChat + 右面板（Notification/Log） |
| `app/layout.tsx` | 根布局 |
| `components/UnifiedChat.tsx` | 主聊天界面，SSE 流式显示，支持 chat/query/analyze 模式 |
| `components/ConversationList.tsx` | 左侧对话列表 |
| `components/SidebarDocs.tsx` | 文档上传侧边栏 |
| `components/LoginForm.tsx` | 登录/注册表单 |
| `components/LogPanel.tsx` | 深色终端风格日志面板，EventSource 连接 `/chat/logs/stream` |
| `components/NotificationPanel.tsx` | 右侧滑出通知面板，3s 轮询 `GET /chat/notifications` |
| `components/ai-ui/` | AI UI 组件库（DynamicForm, SelectionCard, StepsProgress, ConfirmationDialog, ActionButtons, DataTable, InfoCard, ComponentRenderer, ThinkingIndicator） |
| `lib/api.ts` | 前端 API 客户端（auth, conversations, documents, notifications, ui-chat action） |
| `lib/types.ts` | 共享类型定义（AIUIResponse, UIAction, StreamMessage 等） |

## 前端 SSE 流处理模式

UnifiedChat 通过 fetch + ReadableStream 消费后端 SSE 流：
- 使用 `fetch.body.getReader()` 读取 SSE 消息
- 按 `messageType` 分发的消息类型：markdown（追加文本）、ui（渲染组件）、progress（显示进度文本）、done（结束）、error（错误提示）
- `markdown` 消息带 `isChunk: true` 时追加文本，否则替换全文

---

## 已完成功能

| 模块 | 说明 |
|------|------|
| Auth | JWT 注册/登录，scryptSync 密码哈希 |
| Conversation | 对话和消息 CRUD，前端侧边栏切换 |
| Document | 文件上传/列表/删除 |
| UI Protocol | SSE 流式对话（chat/query），需求收集状态机 |
| LangGraph | 意图分类 + 5 节点分析流水线 + ReAct 子图 + clarifyStep 逐题澄清 |
| Clarify | 一问一答澄清流程：LLM 生成问题列表→Claude 风格 chips→规则验证→DB 持久化 plan→多轮循环→完成后进入分析 |
| Logging | console 劫持 + 环形缓冲 + SSE 实时日志流 |
| Notification | 通知轮询骨架 |
| Frontend | 完整的登录页 + 聊天界面 + 日志面板 + 通知面板 + AI UI 组件库 + clarify_question chips |

---

## 待做

- [ ] vector embedding 升级为真实模型（当前 mock）
- [ ] notification 真实通知逻辑
- [ ] 前端 API 请求适配 JWT token（登录后大部分接口未传 token）
- [ ] LangGraph 工具 `search_requirement` 改为查数据库而非 mock 数据
- [ ] 流式响应客户端超时重试机制

---

## 踩坑记录（关键）

### Prisma v7
- ❌ 无参构造 → 报 "needs non-empty PrismaClientOptions"
- ✅ `super({ adapter: new PrismaPg({ connectionString }) })` — v7 "client" 引擎必须用驱动适配器

### LangChain / LangGraph
- `trimMessages` 从 `@langchain/core/messages` 导入，不是 `@langchain/core/runnables`
- 嵌套子图用 `Annotation.Root` 定义独立 State 而非复用父图 State
- `ToolNode` 从 `@langchain/langgraph/prebuilt` 导入

### DeepSeek API
- ❌ 不支持 `withStructuredOutput()` 和 OpenAI response_format
- ✅ 用 JSON prompt → model.invoke() → 正则提取 JSON → Zod 客户端校验
- ❌ 间歇性"静默挂死"（TCP 建立后无响应，Promise 不 resolve 也不 reject）
- ✅ 每个 LLM 调用包裹 `Promise.race` + 超时 + try-catch 兜底

### NestJS
- SSE 必须用 `@Res()` 接管 response 对象：`setHeader` → `flushHeaders` → `res.write()` → `res.end()`
- `main.ts` 第一行 `import './logging/log-capture'` 必须在 NestJS 创建前劫持 console

### 编译流程
- 修改后先 `bun run build` 或 `tsc --noEmit` 检查编译错误
- 新增 Controller/Service 后必须重启服务（ts-node 不监听新文件）

### LangChain 模板花括号转义 (2026-06-04)
- ❌ 在 `ChatPromptTemplate` prompt 里直接写 JSON 示例（含 `{` `}`）→ "Single '}' in template"
- ✅ JSON 示例中的 `{` 写成 `{{`，`}` 写成 `}}`
- 📌 LangChain 的 `ChatPromptTemplate` 使用模板语法，字面量花括号必须双写转义

### LangGraph clarify 模式 classifier 误判 (2026-06-04)
- ❌ 用户提交澄清回答时，短输入被 classifier 误判为 chat，跳过 clarify 流程
- ✅ `classifierNode` 开头检测 `state.clarifyAnswer`，存在时直接返回 `analyze`
- 📌 澄清模式下用户回答不应独立分类，需绕过 LLM 分类器

### SSE markdown 消息兜底 (2026-06-04)
- ❌ 只依赖 SSE markdown 消息设置 content，无兜底→前端显示「空响应」
- ✅ `handleSSE` 返回前若 content 为空但 components 中有 clarify_question，用 question 文本填充
- 📌 SSE 流 TCP 合并/切割或 ping 插入可能导致 markdown 消息解析丢失，UI 组件数据可兜底

---

## 下次继续时的检查清单

- [ ] 运行 `bun run typecheck`（或 `tsc --noEmit`）确保编译通过
- [ ] 检查 PostgreSQL 是否运行（Docker Compose）
- [ ] 启动后端 → 验证 `/chat/logs/stream` SSE 连通
- [ ] 启动前端 → 验证登录页 + 聊天功能
- [ ] 查看 CLAUDE.md 了解最新项目约定
