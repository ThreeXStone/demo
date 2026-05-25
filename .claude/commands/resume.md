# 项目快速恢复上下文 - 2026-05-25

## 项目概览

这是一个基于 Turbo 的 monorepo 项目，使用 Bun 作为包管理器。

### 技术栈
- 前端：Next.js
- 后端：NestJS
- LLM 框架：LangChain (@langchain/core, @langchain/openai)
- 包管理：Bun
- 构建：Turbo

### 目录结构
```
.
├── clients/web/              # Next.js Web 应用
├── services/api/             # NestJS API 服务
│   ├── src/
│   │   ├── config/           # 配置文件
│   │   ├── llm/              # LLM 模块核心
│   │   │   ├── agents/       # Multi-Agent 编排
│   │   │   │   ├── orchestrator.service.ts    # 编排服务
│   │   │   │   └── sub-agents.ts             # 5个子Agent定义
│   │   │   ├── memory/       # 对话记忆
│   │   │   ├── tools/        # 业务工具
│   │   │   ├── embedding/    # 向量化
│   │   │   └── workspace/    # 工作区文档目录
│   │   │       ├── policies/ # 政策文档
│   │   │       ├── tickets/  # 生成的报告
│   │   │       └── faq/      # FAQ文档
├── packages/                 # 共享包
├── .claude/                  # Claude 配置和记忆
└── CLAUDE.md                 # 项目说明文档
```

---

## 常用命令

```bash
# 开发所有服务
bun run dev

# 构建
bun run build

# 类型检查
bun run typecheck

# 单独启动 API 服务
cd services/api && bunx ts-node src/main.ts
```

---

## 核心功能模块

### 1. LLM Module (`services/api/src/llm/`)

#### Memory 服务 - 多轮对话
- **文件**: `memory/runnable-memory.service.ts`
- **端点**:
  - `POST /api/memory/chat` - 发送消息
  - `GET /api/memory/history?sessionId=xxx` - 获取历史
  - `DELETE /api/memory/clear?sessionId=xxx` - 清除会话
- **实现**: RunnableWithMessageHistory + InMemoryChatMessageHistory
- **注意**: LlmModule 使用 @Global() 装饰器，确保单例

#### Business Tools - 业务工具
- **文件**: `tools/business.tools.ts`
- **工具列表**:
  - `query_order` - 查询订单信息
  - `query_product` - 查询商品信息
  - `read_file` - 读取文件（支持 workspace 相对路径）
  - `write_file` - 写入文件（自动创建父目录）
- **返回格式**: 直接返回数据或 `{ error: string }`

#### VectorStore - 向量搜索
- **文件**: `embedding/vector-store.service.ts`
- **实现**: 手动实现，使用 mock embedding（charCodeAt生成）
- **初始化**: OnModuleInit 从 workspace 加载初始文档
- **方法**:
  - `similaritySearch(query, topK)` - 搜索相关文档
  - `similaritySearchWithScore(query, topK)` - 带分数搜索

#### Multi-Agent 编排
- **文件**: `agents/orchestrator.service.ts`
- **流程**: extract → policyCheck + riskReview (并行) → qa → summary
- **5个子Agent** (`agents/sub-agents.ts`):
  1. `extractAgent` - 需求抽取（订单号、请求类型、收货日期、是否未拆封）
  2. `policyCheckAgent` - 政策校验（7天无理由退货，商品需未拆封）
  3. `riskReviewAgent` - 风险审查（歧义、信息缺失、潜在冲突）
  4. `qaAgent` - QA 验收条件（Given-When-Then 格式）
  5. `summaryAgent` - 汇总报告

#### AdvancedAnalysis - 统一入口
- **文件**: `advanced-analysis.service.ts`
- **整合**: Memory + VectorStore + Orchestrator
- **端点**: `POST /api/advanced/analyze`
- **流程**:
  1. 读取历史记录
  2. 拼接上下文和当前输入
  3. 调用 Orchestrator
  4. 如需澄清则 early return
  5. 向量检索相关文档
  6. 写入报告到 tickets/ 目录
  7. 保存结论到 Memory

---

## 当前状态

### 已完成
- [x] Multi-Agent 固定编排
- [x] 文件系统工具
- [x] 向量化能力（mock embedding）
- [x] 多轮对话 Memory
- [x] 统一分析入口
- [x] 修复重复 fallback 逻辑
- [x] 修复 TypeScript 编译错误

### 最近修复
1. 删除了 orchestrator.service.ts 中第 60-70 行的重复 fallback 代码块
2. 修复 `const clarificationQuestions` → `let clarificationQuestions` 的 TS2588 错误

---

## 踩坑记录（关键）

### LangChain 相关
- `trimMessages` 从 `@langchain/core/messages` 导入，不是 `@langchain/core/runnables`
- 使用 RunnablePassthrough.assign 包装 trimMessages
- LangChain 1.4.2 没有 MemoryVectorStore，需手动实现

### NestJS 相关
- DELETE 端点参数用 `@Query('sessionId')`，不用 `@Body()`
- LlmModule 需 `@Global()` 装饰器确保单例
- Service 必须在 providers 和 exports 中声明

### 工具相关
- fs 操作用同步版本（readFileSync, writeFileSync）
- 返回值不包装，直接返回数据或 `{ error: string }`
- 写入工具需自动创建父目录

### 编译流程
- 修改后先 `bun run build` 检查编译错误
- 确认无误再 `bun run dev` 启动服务
- 避免频繁重启导致 EADDRINUSE

---

## 下次继续时的检查清单

- [ ] 查看 `.claude/commands/resume.md` 了解当前状态
- [ ] 运行 `bun run build` 确保编译通过
- [ ] 查看 `CLAUDE.md` 了解项目约定
- [ ] 检查 workspace/ 目录是否有必要的文档