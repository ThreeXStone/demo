# 全局教训

- DeepSeek 不支持 `withStructuredOutput()`/`response_format` — Prompt 要求 JSON → model.invoke() → 正则提取 → Zod 校验
- DeepSeek API 间歇性静默挂死 — 每个 `model.invoke()` 包裹 try-catch + 兜底，HTTP 层设 25s 超时，默认意图设为 `chat`
- OpenAI structured output 不支持 `oneOf`/`anyOf`/`$ref` — 平铺字段到单一 object，`.describe()`，去掉 `.optional()` 用空字符串默认值
- Zod v4 `record()` 签名变更 — `z.record(z.string(), z.string())` 两个参数分别指定 key 和 value
- LangChain `ChatPromptTemplate` 花括号转义 — JSON 示例中 `{` → `{{`，`}` → `}}`
- Multer 中文文件名乱码 — `Buffer.from(file.originalname, 'latin1').toString('utf8')`
- `ts-node` 不监听新增文件 — 新增 Controller/Service 后需重启
- monorepo 端口冲突 — 明确路径启动，不用根目录 `bun run dev`
- `git worktree add` 不复制 gitignore 文件 — 创建后手动 cp `.env` 等
