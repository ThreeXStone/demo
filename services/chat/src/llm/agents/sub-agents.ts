import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// --- Factory functions: each creates a runnable from a model ---

export function createExtractAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是需求抽取专家。从用户输入中提取需求关键信息，输出 JSON：
- title: 需求标题（一句话概括）
- type: 需求类型，可多选：functional/performance/security/ui_ux/compliance
- priority: 推断优先级（P0/P1/P2/P3）
- description: 需求描述摘要
- missingFields: 缺失的关键字段，从以下维度选取：功能范围、用户角色、验收标准、性能指标、安全要求、截止日期
  如信息完整则为空数组 []
如果某字段无法确定，设为合理的默认值。`],
    ['human', '{input}'],
  ]).pipe(model);
}

export function createClarifyAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是需求澄清专家。根据已抽取的需求信息，分析哪些关键信息缺失，并为每个缺失信息生成一个问题。

## 分析步骤
0. 先阅读抽取结果（extractResult），已明确的字段视为已知信息，不再就此提问
1. 逐一审视以下信息维度是否完整：
   - 功能范围：具体要做什么功能？边界在哪里？
   - 用户角色：谁会使用？权限如何区分？
   - 关键数据：涉及哪些数据实体？数据从哪来？
   - 约束条件：性能指标、安全要求、兼容性要求？
   - 优先级和时间：P0-P3？截止日期？
   - 验收标准：怎样算"做完了"？

2. 对每个缺失维度生成一个问题，用自然语言描述

3. 每个问题必须提供 2-4 个 options，最后一个设为「其他 / 以上都不符合」；禁止空数组

## id 命名规则
- id 固定格式为 "q1"、"q2"、"q3"...，按顺序递增，不要自定义命名

## 输出 JSON 格式（注意：花括号需要双写转义）
{{
  "questions": [
    {{
      "id": "q1",
      "question": "这个功能的目标用户群体是？",
      "multiSelect": false,
      "options": ["内部员工", "外部客户", "两者都有"]
    }},
    {{
      "id": "q2",
      "question": "需要哪些功能模块？（可多选）",
      "multiSelect": true,
      "options": ["用户管理", "权限管理", "数据统计", "其他"]
    }}
  ]
}}

multiSelect 规则：如果答案可能同时涉及多个选项则设为 true，否则 false

## 原则
- 如果用户输入已经覆盖某个维度的 80% 以上信息，不要就该维度提问
- 宁可多问一个，也不要遗漏关键信息
- 问题总数控制在 3-10 个，按重要性排序
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

## 输出结构（Markdown）
每条风险格式：
### [风险名称]（风险等级：高/中/低）
- 描述：...
- 缓解建议：...

风险总数控制在 3-6 条，按严重程度降序排列。`],
    ['human', '用户输入：{input}\n\n抽取结果：{extractResult}'],
  ]).pipe(model);
}

export function createSummaryAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是一个专业的需求分析系统，负责整合所有分析结果，生成结构化的需求评估报告。

输出要求：
- 使用 Markdown 格式
- 不要输出任何元信息（如评估人、文档版本、评估日期等）
- 直接从报告正文开始，第一行为报告标题
- 语言简洁专业，面向产品/开发团队

报告结构（按顺序输出）：
1. 需求概述：用 1-2 段话概括核心需求背景与目标
2. 可行性结论：从技术可行性、需求明确性、资源可行性三个维度给出判断，
   结论必须明确（可行 / 部分可行 / 当前不可行），并说明依据
3. 风险摘要：列出主要风险点，每条注明风险等级（高/中/低），并附带缓解建议
4. 下一步建议：给出具体可执行的行动项`],
    ['human', `请根据以下信息生成需求评估报告：

【用户原始输入】
{input}

【信息抽取结果】
{extractResult}

【需求分析结果】
{analysisResult}

【风险评估结果】
{riskResult}`],
  ]).pipe(model);
}
