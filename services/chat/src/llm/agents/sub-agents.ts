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
    ['system', `你是需求澄清专家。根据已抽取的需求信息，判断是否需要向用户追问。
输出 JSON：
- needsClarification: 是否需要澄清（true/false）
- questions: 需要追问的问题列表`],
    ['human', '用户输入：{input}\n\n抽取结果：{extractResult}'],
  ]).pipe(model);
}

export function createAnalysisAgent(model: BaseChatModel) {
  return ChatPromptTemplate.fromMessages([
    ['system', `你是需求分析专家。对需求进行深度分析，包括：
- 功能范围界定
- 技术可行性评估
- 影响范围分析
- 依赖关系识别
输出 Markdown 格式的分析报告。`],
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
