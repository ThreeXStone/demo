# 项目快速恢复上下文 - 2026-05-28

## 项目概览

这是一个基于 Turbo 的 monorepo 项目，使用 Bun 作为包管理器。

### 技术栈
- 前端：Next.js
- 后端：NestJS
- LLM 框架：LangChain (@langchain/core, @langchain/openai)
- 数据库：PostgreSQL + Prisma v7（PrismaPg 驱动适配器）
- 认证：JWT（@nestjs/jwt + passport-jwt）
- 包管理：Bun
- 构建：Turbo

### 目录结构
```
.
├── clients/web/              # Next.js Web 应用
├── services/api/             # NestJS API 服务
│   ├── prisma/
│   │   └── schema.prisma     # 数据库 Schema（User/Conversation/Message/Document）
│   ├── prisma.config.ts      # Prisma v7 CLI 配置（datasource URL）
│   ├── src/
│   │   ├── main.ts           # 入口，端口 3001
│   │   ├── app.module.ts     # 根模块
│   │   ├── config/           # 配置文件（langchain.yaml 加载）
│   │   ├── auth/             # JWT 认证模块
│   │   ├── prisma/           # PrismaService（全局模块）
│   │   ├── conversation/     # 会话 + 消息 + 持久化聊天历史
│   │   └── llm/              # LLM 模块核心
│   │       ├── agents/       # Multi-Agent 编排
│   │       ├── memory/       # 内存版对话记忆（旧，将被替代）
│   │       ├── tools/        # 业务工具
│   │       ├── embedding/    # 向量化
│   │       └── filesystem/   # 文件系统工具
├── services/chat/            # Chat 服务（骨架，暂无业务代码）
├── packages/                 # 共享包
├── .claude/                  # Claude 配置和记忆
└── CLAUDE.md                 # 项目说明文档
```

---

## 常用命令

```bash
# 开发所有服务
bun run dev

# 单独启动 API 服务
bun dev:api

# 构建
bun run build

# 类型检查
bun run typecheck

# 生成 Prisma Client
npx prisma generate

# 手动生成 JWT 测试 Token
node -e "const { JwtService } = require('@nestjs/jwt'); const s = new JwtService({ secret: 'dev-secret' }); console.log(s.sign({ sub: 'test-user-001', email: 'test@example.com' }))"
```

---

## 核心功能模块

### 1. Auth 模块 (`services/api/src/auth/`)

JWT 认证，保护所有会话接口。

| 文件 | 作用 |
|---|---|
| `auth.module.ts` | 全局模块，注册 JwtModule + PassportModule + JwtStrategy + JwtAuthGuard |
| `jwt.strategy.ts` | 从 Bearer Token 提取 payload，`validate()` 返回 `{ userId, email }` 挂载到 `req.user` |
| `jwt.guard.ts` | `JwtAuthGuard extends AuthGuard('jwt')`，用于 `@UseGuards(JwtAuthGuard)` |

- JWT Secret：环境变量 `JWT_SECRET`，默认值 `dev-secret`
- Token 签发：`{ sub: userId, email }` → 目前无登录接口，测试时手动生成

### 2. Conversation 模块 (`services/api/src/conversation/`)

用 PostgreSQL 替代 InMemoryChatMessageHistory，实现会话和消息持久化。

#### 2.1 ConversationService (`conversation.service.ts`)
CRUD 操作，所有方法带用户权限校验：
- `create(userId, title?)` → 创建会话
- `findByUser(userId)` → 获取用户所有会话（按 updatedAt 降序）
- `findById(conversationId, userId)` → 获取单个会话（含权限校验，NotFoundException / ForbiddenException）
- `delete(conversationId, userId)` → 删除会话（级联删除消息）

#### 2.2 MessageService (`message.service.ts`)
消息读写与 LangChain 转换：
- `addMessage(conversationId, role, content, metadata?)` → 写入 Message 表
- `getHistory(conversationId, limit?)` → 读取历史消息
- `getHistoryAsLangChainMessages(conversationId)` → 将 DB 行转换为 `BaseMessage[]`（HumanMessage / AIMessage / SystemMessage）

#### 2.3 DbChatMessageHistory (`db-chat-history.ts`)
实现 LangChain 的 `BaseChatMessageHistory` 接口，使 `RunnableWithMessageHistory` 直接读写数据库：
- `getMessages()` → 调用 `MessageService.getHistoryAsLangChainMessages()`
- `addMessage(message)` → 解析 role 后调用 `MessageService.addMessage()`
- `addUserMessage()` / `addAIMessage()` → BaseChatMessageHistory 必需方法
- `clear()` → 空实现（删除会话时级联删除消息）

#### 2.4 ConversationController (`conversation.controller.ts`)
路由 `@Controller('api/conversations')`，全部 `@UseGuards(JwtAuthGuard)`：

| 方法 | 路由 | 功能 |
|---|---|---|
| POST | `/` | 创建会话，body: `{ title? }` |
| GET | `/` | 获取当前用户会话列表 |
| GET | `/:id/messages` | 获取会话消息历史，query: `?limit=` |
| POST | `/:id/chat` | 在指定会话中发送消息，body: `{ input }` |
| DELETE | `/:id` | 删除会话 |

`POST /:id/chat` 的完整链路：
1. JWT Guard → 获取 `req.user.userId`
2. `findById()` → 权限校验
3. 构建 `RunnableWithMessageHistory`，`getMessageHistory` 工厂返回 `new DbChatMessageHistory(conversationId, messageService)`
4. 链路：trimMessages(2000 tokens) → ChatPromptTemplate → ChatOpenAI
5. 返回 `{ output: result.content }`

### 3. Prisma 模块 (`services/api/src/prisma/`)

- `schema.prisma`（`services/api/prisma/schema.prisma`）：5 个模型（User, Conversation, Message, Document, DocumentChunk）
- `prisma.service.ts`：使用 Prisma v7 的 PrismaPg 驱动适配器，`super({ adapter: new PrismaPg({ connectionString }) })`
- `prisma.module.ts`：`@Global()` 模块，导出 PrismaService
- `prisma.config.ts`（`services/api/prisma.config.ts`）：Prisma v7 CLI 配置

**重要**：Prisma v7 使用 "client" 引擎，必须通过 `@prisma/adapter-pg` + `pg` 包提供驱动适配器，不能再用旧的 `datasources` 配置。

### 4. LLM Module (`services/api/src/llm/`)

#### Memory 服务 - 内存版多轮对话（旧）
- **文件**: `memory/runnable-memory.service.ts`
- **端点**: `POST /api/memory/chat`, `GET /api/memory/history`, `DELETE /api/memory/clear`
- **实现**: `RunnableWithMessageHistory` + `InMemoryChatMessageHistory`
- **注意**: 会话不持久化，服务重启后丢失。新功能请用 Conversation 模块

#### Business Tools - 业务工具
- **文件**: `tools/business.tools.ts`
- **工具**: `query_order`, `query_product`, `read_file`, `write_file`
- **返回格式**: 直接返回数据或 `{ error: string }`

#### VectorStore - 向量搜索
- **文件**: `embedding/vector-store.service.ts`
- **实现**: 手动内存向量存储，mock embedding（charCodeAt 生成）
- **初始化**: `OnModuleInit` 从 workspace 加载文档

#### Multi-Agent 编排
- **文件**: `agents/orchestrator.service.ts`
- **流程**: extract → policyCheck + riskReview (并行) → qa → summary
- **5个子Agent** (`agents/sub-agents.ts`): extract / policyCheck / riskReview / qa / summary

#### AdvancedAnalysis - 统一入口
- **文件**: `advanced-analysis.service.ts`
- **整合**: Memory + VectorStore + Orchestrator
- **端点**: `POST /api/advanced/analyze`

---

## 数据库 Schema

```prisma
User          → id, email, name, password, role, conversations[], documents[]
Conversation  → id, title, userId, messages[], createdAt, updatedAt
Message       → id, conversationId, role(human|ai|system|tool), content(@db.Text), metadata(Json?)
Document      → id, userId, filename, originalName, mimeType, status, chunks[]
DocumentChunk → id, documentId, content, chunkIndex, metadata, embedding(vector(384)?)
```

外键关系：Conversation.userId → User, Message.conversationId → Conversation (onDelete: Cascade)

---

## 接口测试指南

```bash
# 1. 生成 Token（userId 需对应数据库中存在的 User 记录）
TOKEN=$(node -e "const { JwtService } = require('@nestjs/jwt'); const s = new JwtService({ secret: 'dev-secret' }); console.log(s.sign({ sub: 'test-user-001', email: 'test@example.com' }))")

# 2. 创建会话
curl -X POST http://localhost:3001/api/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "退货咨询"}'
# → { id, title, userId, createdAt, updatedAt }

# 3. 在会话中聊天（消息自动持久化到 Message 表）
curl -X POST http://localhost:3001/api/conversations/{id}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input": "我想退货"}'
# → { output: "..." }

# 4. 查看消息历史
curl http://localhost:3001/api/conversations/{id}/messages \
  -H "Authorization: Bearer $TOKEN"
# → [{ id, conversationId, role, content, metadata, createdAt }, ...]

# 5. 获取会话列表
curl http://localhost:3001/api/conversations \
  -H "Authorization: Bearer $TOKEN"

# 6. 删除会话（级联删除消息）
curl -X DELETE http://localhost:3001/api/conversations/{id} \
  -H "Authorization: Bearer $TOKEN"
```

**注意**：JWT payload 的 `sub` 字段对应用户 ID，该用户必须存在于 User 表中，否则外键约束报 500。

---

## 当前状态

### 已完成
- [x] Multi-Agent 固定编排
- [x] 文件系统工具
- [x] 向量化能力（mock embedding）
- [x] 多轮对话 Memory（InMemoryChatMessageHistory 版本）
- [x] 统一分析入口
- [x] **JWT 认证模块**（auth/，全局 AuthModule）
- [x] **会话持久化模块**（conversation/，PostgreSQL 替代内存存储）
- [x] **DbChatMessageHistory**（BaseChatMessageHistory 接口实现，兼容 RunnableWithMessageHistory）
- [x] **Prisma v7 适配**（PrismaPg 驱动适配器）
- [x] 修复 TypeScript 编译错误

### 待做
- [ ] 登录/注册接口（POST /api/auth/login, POST /api/auth/register）
- [ ] services/chat 服务接入 Prisma 和 Conversation 模块
- [ ] 流式响应（SSE）支持 POST /:id/chat
- [ ] 向量搜索升级为真实 embedding（替换 mock）

---

## 踩坑记录（关键）

### Prisma v7
- ❌ `extends PrismaClient` 无参构造 → 运行时报 "needs non-empty PrismaClientOptions"
- ❌ `super({ datasources: { db: { url } } })` → TS 类型报错，v7 不再支持
- ❌ `super({ datasourceUrl: ... })` → 同上
- ✅ `super({ adapter: new PrismaPg({ connectionString }) })` — Prisma v7 "client" 引擎必须用驱动适配器
- 📌 原因：Prisma v7 移除了内嵌引擎，schema 中 `datasource` 不再声明 url，运行时通过 adapter 传入

### LangChain 相关
- `trimMessages` 从 `@langchain/core/messages` 导入，不是 `@langchain/core/runnables`
- 使用 `RunnablePassthrough.assign` 包装 trimMessages
- `BaseChatMessageHistory` 子类必须实现 `addUserMessage` 和 `addAIMessage`（TS2654）
- LangChain 1.4.2 没有 MemoryVectorStore，需手动实现

### NestJS 相关
- DELETE 端点参数用 `@Query('sessionId')`，不用 `@Body()`
- `@Global()` 模块（PrismaModule, AuthModule）导出的 provider 无需在子模块重复 imports
- `@UseGuards(JwtAuthGuard)` 加在 Controller 类上 = 所有路由生效

### JWT 认证
- `JwtStrategy.validate()` 返回的对象 = `req.user`，字段名必须与 Controller 中 `req.user.userId` 一致
- JWT 的 `sub` 字段 = 用户 ID，对应用户必须存在于数据库 User 表（外键约束）

### 编译流程
- 修改后先 `bun run build` 检查编译错误
- 确认无误再启动服务
- 避免频繁重启导致 EADDRINUSE

---

## 下次继续时的检查清单

- [ ] 运行 `bun run build` 确保编译通过
- [ ] 查看 `CLAUDE.md` 了解项目约定
- [ ] 检查 workspace/ 目录是否有必要的文档
- [ ] 启动服务后先确认 JWT 认证和 Conversation 接口正常
