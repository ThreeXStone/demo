# 需求分析流式输出的设计问题

## 一、当前流式架构

项目通过四层管道实现流式输出：

```
LLM token → LangGraph streamEvents → Orchestrator 事件总线 → SSE → 前端 ReadableStream
```

核心实现在 `services/chat/src/llm/graph/requirement-analysis-graph.ts` 的 `streamAnalysisGraph` 函数（行 814-1056）。它使用 LangGraph 的 `graph.streamEvents(..., { version: 'v2' })` 监听整张计算图中所有 LLM 调用的 `on_chat_model_stream` 事件，将 token 逐字向上透传。

当前 token 过滤名单只屏蔽了 3 个 JSON 节点：

```typescript
// requirement-analysis-graph.ts:907
const jsonNodes = ['extractStep', 'clarifyStep', 'triage'];
const shouldStreamToken = !jsonNodes.includes(currentNode);
```

其余节点的 token **全部流向用户**。

---

## 二、当前图中有哪些节点会产生 LLM 输出

以一条 `analyze` 路径为例，图执行经过以下会产生 LLM 输出的节点：

| 节点 | 所在子图 | 输出内容 | 是否流式 | 用户需要看吗？ |
|------|----------|----------|----------|---------------|
| `triage` | 主图 | 意图分类 JSON | ✗ 已过滤 | 不需要 |
| `extractStep` | 主图 | 需求提取 JSON | ✗ 已过滤 | 不需要 |
| `clarifyStep` | 主图 | 澄清判断 JSON | ✗ 已过滤 | 不需要 |
| `supervisor` | 分析子图 | 专家选择 JSON | ✗ withStructuredOutput | 不需要 |
| `functional_expert` | 分析子图 | 功能分析 Markdown | ✓ 流式 | **不需要**（素材） |
| `performance_expert` | 分析子图 | 性能分析 Markdown | ✓ 流式 | **不需要**（素材） |
| `security_expert` | 分析子图 | 安全分析 Markdown | ✓ 流式 | **不需要**（素材） |
| `compliance_expert` | 分析子图 | 合规分析 Markdown | ✓ 流式 | **不需要**（素材） |
| `riskStep` | 主图 | 风险评估 Markdown | ✓ 流式 | **不需要**（素材） |
| `actor` | Critic-Refine 子图 | 初版综合报告 | ✓ 流式 | **不需要**（草稿） |
| `critic` | Critic-Refine 子图 | 评审意见 JSON | ✓ 流式 | **不需要**（内部反馈） |
| `refine` | Critic-Refine 子图 | 修订版报告 | ✓ 流式 | 部分需要（只有最后一轮才要） |
| `queryHandler` | 主图 | 查询结果 | ✓ 流式 | 需要 |

---

## 三、问题

### 问题 1：中间素材对用户无意义

四个专家子图和 riskStep 的输出是**给 summary 节点消费的「原材料」**，类似函数内部的中间变量：

- `functionalAnalysis`、`performanceAnalysis`、`securityAnalysis`、`complianceAnalysis` 四份专家报告汇入 `analysisResult`
- `riskResult` 汇入 summary 节点
- summary 节点综合以上内容生成最终报告

这些中间产物篇幅长、格式不统一（每个专家独立输出 Markdown），用户没有阅读它们的动机。把它们流式推给前端，本质上是**把函数内部的 `console.log` 暴露给了最终用户**。

### 问题 2：Critic-Refine 子图的内部迭代被暴露

`createSummarySubGraph`（行 246-447）内部是 `actor → critic → refine` 的循环：

```
actor（生成初版）→ critic（评审）→ 不通过 → refine（修订）→ critic（再评审）→ 通过 → END
```

三个内部节点的 token 全部被流式推送。用户会看到：
1. 一份初版报告逐字出现
2. 一段评审意见逐字出现（`{ "pass": false, "critique": "缺少冲突分析章节..." }`）
3. 修订版报告再次逐字出现
4. 可能还有第二轮修订

用户真正需要的是**第 N 轮修订后的最终报告**，之前的所有版本都是噪音。更糟的是，critic 的输出是 JSON 格式（`{ pass, critique }`），对用户完全不可读。

### 问题 3：产品意图与流式语义错位

这个项目用 `streamEvents` 的初衷是好的——LangGraph 提供了完整的事件流，可以观测每一步执行。但 `streamEvents` 解决的问题是**开发者可观测性**（debug 时看每个节点的输入输出），而**用户需要的是「等待进度感知 + 最终结果流畅展示」**。

当前做法是把开发者的可观测性数据直接套到了用户体验层，导致两者耦合在一起——调整展示逻辑需要改 graph 层的过滤名单，改动 graph 层的节点又可能意外泄漏新的中间输出。

---

## 四、约束

最终报告是通过 SSE 推送给前端的 Markdown 文本。前端使用 `ReadableStream` + `TextDecoder` 逐行解析 `data:` 事件，通过 Zustand store 驱动 React 逐字渲染。前端已支持通过 `messageType` 字段区分消息类型（`markdown` / `progress` / `meta` / `done`）。前端不需要改造。

目标是：**让用户只看到最终综合报告的流式输出，同时仍然能看到管线执行进度（哪个 Agent 在干活）。**

---

## 五、方案对比

### 方案一：在 graph 层扩大过滤范围（改动小）

**思路**：`streamAnalysisGraph` 继续使用 `streamEvents`，但把除了最终报告生成节点之外的所有节点都加入 token 过滤名单。

**做法**：在 `on_chat_model_stream` 事件处，扩大 `silentNodes` 名单：
```typescript
const silentNodes = [
  'functional_expert', 'performance_expert', 'security_expert', 'compliance_expert',
  'actor', 'critic', 'refine',
];
if (silentNodes.includes(currentNode)) {
  // 不 yield token，静默执行
}
```
`complete` 事件中的 `result.summary` 即为 Critic-Refine 最终版报告，由 orchestrator 手动分块推送。

**优点**：改动范围小，只改 `streamAnalysisGraph` 一个函数。

**缺点**：
- 仍然调用 `streamEvents`，LLM token 事件全量生成了但被丢弃，资源浪费
- graph 层要知道"哪些节点不该被看到"，属于展示逻辑侵入计算层
- 每增删一个子图节点都要维护过滤名单

---

### 方案二：graph 层只推进度，orchestrator 层负责内容输出（改动大但干净）

**思路**：graph 层完全不做 token 流式，只通过 `graph.stream(..., { streamMode: 'updates' })` 推送节点进度。最终 state 的 `summary` 字段由 orchestrator 拿到后手动分块推送。

**做法**：
```typescript
// 图执行：只追踪状态更新，不监听 LLM token
for await (const chunk of await graph.stream(input, { streamMode: 'updates' })) {
  yield { type: 'node_update', node: detectNode(chunk) };
}
// 拿最终状态
const finalState = await graph.getState(config);
// orchestrator 层手动分块推送
const cleanReport = finalState.values.summary;
for (let i = 0; i < cleanReport.length; i += 3) {
  yield { type: 'token', content: cleanReport.slice(i, i + 3) };
  await sleep(30);
}
```

**优点**：
- graph 层只负责计算，不关心展示逻辑
- 不存在 token 泄漏风险，新增多少子图节点都不会意外曝光
- 不需要维护过滤名单
- 最终报告的内容完全可控（可以在推送前做后处理，如去除章节标记残留）

**缺点**：
- 失去了原生 token 级流式输出——改为字符分块模拟打字机效果，体验略差
- 改动范围更大，涉及 `streamAnalysisGraph` + `streamOrchestrate` 两个函数
- 如果未来有非 summary 的内容也需要流式（如 query 路径），需要额外处理

---

## 六、建议

**推荐方案二。** 核心判据是架构清晰度——计算层和展示层的职责应该分开。当前架构把展示逻辑（`jsonNodes` 过滤名单）硬编码在 graph 层，已经是一个坏味道；如果按方案一继续扩大过滤名单，只是把坏味道放大。

对于"失去原生 token 流式"的代价——报告类场景的用户对打字机效果的细腻度不敏感，每条消息 30ms 间隔的模拟流式完全够用，且最终报告通常只有 500-1000 字，总延迟不超过 10 秒，用户体感与原生流式差异极小。
