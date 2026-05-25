# LangChain 提示模板抽取与调用示例

## 任务目标

在 `services/api` 的 LangChain 层中，将提示内容抽成模板，并提供最小模板渲染与调用示例。

测试输入统一为：`'用户注册时必须绑定手机号，密码至少8位'`

---

## 执行步骤

### 第一步：新建提示模板文件

新建 `services/api/src/llm/prompts/requirement.prompt.ts`，要求：

- 导出 `REQUIREMENT_SYSTEM_PROMPT`：系统角色提示，定义模型的行为和角色
- 导出 `REQUIREMENT_USER_TEMPLATE`：用户消息模板，必须包含 `{input}` 占位符

### 第二步：新建模板构建器

新建 `services/api/src/llm/requirement.prompt-builder.ts`，要求：

- 使用 `ChatPromptTemplate.fromMessages()` 组装 system + human 消息
- 导出构建好的 prompt template 供 service 调用

### 第三步：在 Controller 新增两个路由

在现有 `llm.controller.ts` 中新增：

**`POST /api/langchain/prompt-preview`**
- 只渲染模板，不调用模型
- 将 `{input}` 替换为实际内容后返回渲染结果
- 用于验证模板格式是否正确

**`POST /api/langchain/prompt-to-model`**
- 完整链路：模板渲染 → `formatMessages()` → 模型调用
- 返回模型响应结果

### 第四步：测试验证

服务重启后依次执行以下 curl 命令：

```bash
# 测试模板渲染（不调模型）
curl -s -X POST http://localhost:3001/api/langchain/prompt-preview \
  -H "Content-Type: application/json" \
  -d '{"input": "用户注册时必须绑定手机号，密码至少8位"}'

# 测试完整链路（模板 → 模型）
curl -s -X POST http://localhost:3001/api/langchain/prompt-to-model \
  -H "Content-Type: application/json" \
  -d '{"input": "用户注册时必须绑定手机号，密码至少8位"}'
```

**验证标准：**
- ✅ `prompt-preview`：返回渲染后的消息数组，包含 system 和 human 消息
- ✅ `prompt-to-model`：返回模型的响应文本
- ❌ 任一失败：查看 `bun dev` 终端的错误日志，排查后记录到 `CLAUDE.md` 踩坑章节

---

## 注意事项

- 包管理使用 `bun add <package> --cwd services/api`，不要用 npm
- 新增路由后确认 `bun dev` 终端有对应的 `Mapped` 日志
- 不要修改已有的 `invoke`、`stream`、`batch` 路由
- 代码风格与现有文件保持一致
