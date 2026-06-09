# 智能需求分析系统

基于 LangGraph 的多 Agent 需求分析平台，支持需求澄清、多维度专家分析、风险评估和汇总报告生成。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 15, React 19, Tailwind CSS 4 |
| 后端 | NestJS, LangChain, LangGraph |
| 数据库 | PostgreSQL + Prisma v7 |
| 包管理 | Bun, Turbo (monorepo) |

## 项目结构

```
.
├── clients/chat-web/         # Next.js 前端 (端口 3003)
├── services/chat/            # NestJS 后端 (端口 3002)
├── packages/contracts/       # 共享类型契约
└── infra/compose/            # Docker Compose (PostgreSQL)
```

## 快速开始

```bash
# 安装依赖
bun install

# 启动数据库
cd infra/compose && docker compose up -d

# 生成 Prisma Client
cd services/chat && bunx prisma generate && bunx prisma db push

# 启动开发环境
bun dev
```

## 核心功能

### 需求分析流水线

```
用户输入 → Triage(分诊) → Extract(抽取) → Clarify(澄清) → [Analysis ∥ Risk](并行分析) → Summary(汇总)
```

- **Triage**: 意图分诊，区分闲聊/分析/风险评估，简单问题直接回答
- **Extract**: 结构化抽取需求信息（标题、类型、优先级、描述）
- **Clarify**: 多轮澄清问答（最多 10 个问题，支持多选），补全缺失信息
- **Analysis**: Supervisor 调度 4 个专家（功能/性能/安全/合规）并行分析
- **Risk**: 风险评估（3-6 条，含风险等级和缓解建议）
- **Summary**: Critic-Refine 子图 → 生成报告 → 质量评审 → 修订 → 最终输出

### 双模型架构

| 节点 | 模型 | 用途 |
|---|---|---|
| Triage / Extract / Risk | deepseek-v4-flash | 结构化输出、简单判断 |
| Clarify / Analysis / Summary | 可配置强模型 | 深度推理、长文本生成 |

## API

| 端点 | 说明 |
|---|---|
| `POST /chat/ui-chat/analyze` | 流式需求分析（SSE） |
| `POST /chat/ui-chat/requirement/collect` | 需求表单收集 |
| `POST /chat/ui-chat/requirement/action` | 表单交互操作 |
| `POST /chat/conversations` | 会话管理 |
| `GET /chat/model-configs/available` | 可用模型列表 |

## 环境变量

```bash
DATABASE_URL=postgresql://...
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-v4-pro    # 默认强模型
```
