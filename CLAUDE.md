# 项目概览

基于 Turbo 的 monorepo，Bun 作为包管理器。

```
.
├── clients/chat-web/         # Next.js 前端 (端口 3003)
├── services/chat/            # NestJS 后端 (端口 3002)
├── packages/contracts/       # 共享类型契约
└── infra/compose/            # Docker Compose (PostgreSQL)
```

## 常用命令

```bash
bun install                                                      # 安装依赖
cd services/chat && bunx ts-node --transpile-only src/main.ts   # 启动后端
cd clients/chat-web && bun run dev                               # 启动前端
cd services/chat && bunx prisma generate                        # 生成 Prisma Client
```

## 技术栈

- 前端：Next.js 15, React 19, Tailwind CSS 4
- 后端：NestJS, LangChain, LangGraph
- 数据库：PostgreSQL + Prisma v7
- 包管理：Bun，构建：Turbo

## Git 提交规范

所有 commit 遵循 Conventional Commits：`<type>(<scope>): <中文描述>`

类型：feat / fix / docs / style / refactor / test / chore

### 工作流
- 提交前用 `git diff --staged` 确认改动，确认后再提交
- 用 `git add <具体文件>`，不用 `git add .`
- 多个功能点拆分成多个小 commit
- 合并前检查是否需要 rebase

## 相关文件
- 项目全局级经验教训：@LESSONS.md
- 后端特定：@services/chat/CLAUDE.md
- 前端特定：@clients/chat-web/CLAUDE.md
