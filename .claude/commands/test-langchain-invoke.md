# 测试 LangChain invoke 接口

## 任务目标

在 `services/api` 中新增一个可测试的 LangChain invoke 接口，验证模型调用是否正常工作。

## 执行步骤

### 第一步：新增 invokeDemo 方法

在现有的 LangChain Service 文件中新增 `invokeDemo` 方法，要求：
- 接收一个 `input` 字符串
- 通过 `invoke()` 调用模型
- 返回模型的响应结果
- 做好错误处理，调用失败时返回清晰的错误信息

### 第二步：新增路由

在对应的 Controller 中新增：
- 方法：`@Post('invoke')`
- 完整路径：`/api/langchain/invoke`
- 接收 body：`{ "input": string }`
- 返回：模型响应结果

### 第三步：启动服务并测试

确认 `services/api` 已在 `:3001` 运行，然后执行以下 curl 命令测试：

```bash
curl -s -X POST http://localhost:3001/api/langchain/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": "用户注册时必须绑定手机号，密码至少8位"}' | jq
```

### 第四步：验证结果

- ✅ 成功：终端输出模型的响应内容
- ❌ 失败：输出错误信息，排查原因后记录到 `CLAUDE.md` 的踩坑章节

## 注意事项

- 包管理使用 `bun add <package> --cwd services/api`，不要用 npm
- 新增代码风格与现有文件保持一致
