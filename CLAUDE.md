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
