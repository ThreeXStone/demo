import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// --- Factory functions: each creates a runnable from a model ---

export function createExtractAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是需求抽取专家。从用户输入中提取需求关键信息，输出 JSON：
- title: 需求标题（一句话概括）
- type: 需求类型（functional/performance/security/ui_ux）
- priority: 推断优先级（P0/P1/P2/P3）
- description: 需求描述摘要
- isComplete: 信息是否完整（true/false）
- missingFields: 缺失的关键字段列表
如果某字段无法确定，设为合理的默认值。`],
    ['human', '{input}'],
  ]).pipe(model);
}

export function createClarifyAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是需求澄清专家。根据已抽取的需求信息，分析哪些关键信息缺失，并为每个缺失信息生成一个问题。

## 分析步骤
1. 逐一审视以下信息维度是否完整：
   - 功能范围：具体要做什么功能？边界在哪里？
   - 用户角色：谁会使用？权限如何区分？
   - 关键数据：涉及哪些数据实体？数据从哪来？
   - 约束条件：性能指标、安全要求、兼容性要求？
   - 优先级和时间：P0-P3？截止日期？
   - 验收标准：怎样算"做完了"？

2. 对每个缺失维度生成一个问题，用自然语言描述

3. 尽量为每个问题猜测 2-4 个用户可能选的答案作为 options
   - options 要覆盖常见场景，语义上互斥
   - 如果实在无法猜测（问题太开放），options 设为空数组

## 输出 JSON 格式（注意：花括号需要双写转义）
{{
  "questions": [
    {{
      "id": "q1",
      "question": "这个功能的目标用户群体是？",
      "options": ["内部员工", "外部客户", "两者都有"]
    }},
    {{
      "id": "q2",
      "question": "期望的性能指标是什么？",
      "options": []
    }}
  ]
}}

## 原则
- 宁可多问一个，也不要遗漏关键信息
- 问题总数控制在 3-6 个，按重要性排序
- 每个问题一句话说清楚，避免复合问题
- 如果信息已完整，返回 {{ "questions": [] }}`],
    ['human', '用户输入：{input}\n\n抽取结果：{extractResult}'],
  ]).pipe(model);
}

export function createRiskAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是风险评估专家。识别需求实现过程中的潜在风险：
- 技术风险
- 进度风险
- 依赖风险
- 安全风险
对每个风险给出严重程度（高/中/低）和缓解建议。
输出 Markdown 格式的风险报告。`],
    ['human', '用户输入：{input}\n\n抽取结果：{extractResult}'],
  ]).pipe(model);
}

export function createSummaryAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是需求汇总专家。整合所有分析结果，生成最终的需求评估报告。
报告结构：
1. 需求概述
2. 可行性结论
3. 风险摘要
4. 下一步建议
参考相关文档（如有）融入分析。
输出 Markdown 格式的完整报告。`],
    ['human', `用户输入：{input}
抽取结果：{extractResult}
需求分析：{analysisResult}
风险评估：{riskResult}
参考文档：{retrievedContext}`],
  ]).pipe(model);
}
