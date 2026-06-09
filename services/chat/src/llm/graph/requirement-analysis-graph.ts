import { Annotation, MessagesAnnotation, StateGraph, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  createExtractAgent,
  createClarifyAgent,
  createRiskAgent,
  createSummaryAgent,
} from '../agents/sub-agents';
import { createAnalysisSupervisorSubGraph } from './experts';

// --- State Definition ---

export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  input: Annotation<string>,
  retrievedContext: Annotation<string>,
  history: Annotation<{ role: 'user' | 'assistant'; content: string }[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),
  // triage
  intent: Annotation<'analyze' | 'chat' | 'risk_only'>({
    default: () => 'chat',
    reducer: (_, next) => next,
  }),
  handoffReason: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  // analysis pipeline
  extracted: Annotation<Record<string, unknown>>({
    default: () => ({}),
    reducer: (_, next) => next,
  }),
  clarified: Annotation<{ needsClarification: boolean; questions: string[] }>({
    default: () => ({ needsClarification: false, questions: [] }),
    reducer: (_, next) => next,
  }),
  analysisResult: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  riskResult: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  toolLoopCount: Annotation<number>({
    default: () => 0,
    reducer: (_, next) => next,
  }),
  // Expert analysis outputs (Supervisor + 多专家)
  functionalAnalysis: Annotation<string>({
    default: () => '',
    reducer: (a, b) => b || a,  // non-empty wins; safe for parallel fan-in
  }),
  performanceAnalysis: Annotation<string>({
    default: () => '',
    reducer: (a, b) => b || a,
  }),
  securityAnalysis: Annotation<string>({
    default: () => '',
    reducer: (a, b) => b || a,
  }),
  complianceAnalysis: Annotation<string>({
    default: () => '',
    reducer: (a, b) => b || a,
  }),
  activeExperts: Annotation<string[]>({
    default: () => ['functional'],
    reducer: (_, next) => next,
  }),
  summary: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  // Critic-Refine 子图字段
  critique: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  reviseCount: Annotation<number>({
    default: () => 0,
    reducer: (_, next) => next,
  }),
  summaryHistory: Annotation<string[]>({
    default: () => [],
    reducer: (old, next) => [...old, ...next],
  }),
  // fast-path response
  chatResponse: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  // --- clarify ---
  preExtracted: Annotation<Record<string, unknown> | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  clarifyPlan: Annotation<Record<string, unknown> | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  currentQuestion: Annotation<{ id: string; question: string; options: string[] } | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  questions: Annotation<{ id: string; question: string; options: string[]; answer: string | null; retryCount: number; skipped: boolean; status: string }[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),
  clarifiedData: Annotation<Record<string, string>>({
    default: () => ({}),
    reducer: (_, next) => next,
  }),
  clarifyAnswer: Annotation<{ questionId: string; answer: string; source: string } | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  skipClarify: Annotation<boolean>({
    default: () => false,
    reducer: (_, next) => next,
  }),
  retryHint: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  needsClarification: Annotation<boolean>({
    default: () => false,
    reducer: (_, next) => next,
  }),
});

// --- Triage Zod Schema (Handoff 模式) ---

const triageSchema = z.object({
  action: z.enum(['answer', 'handoff_to_analysis', 'handoff_to_risk']),
  response: z.string().optional().default('').describe('当 action=answer 时直接回复用户的内容'),
  reason: z.string().optional().default('').describe('交接理由'),
});

// --- JSON Parser ---

const parseJson = <T>(raw: unknown, fallback: T): T => {
  try {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    return JSON.parse(match ? match[1].trim() : text.trim());
  } catch {
    return fallback;
  }
};

// --- Mock Tools (moved to ./expert-tools.ts) ---

// --- Summary SubGraph (Critic-Refine) ---

function createSummarySubGraph(model: BaseChatModel) {
  async function actorNode(
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> {
    const t0 = Date.now();
    const agent = createSummaryAgent(model);
    const result = await agent.invoke({
      input: state.input,
      extractResult: JSON.stringify(state.extracted),
      analysisResult: state.analysisResult,
      riskResult: state.riskResult,
    });
    const summary = typeof result.content === 'string' ? result.content : '';
    console.log(`[计时] summaryStep actorNode 完成 (${summary.length} chars)，耗时 ${Date.now() - t0}ms`);
    return { summary };
  }

  async function criticNode(
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> {
    const response = await model.invoke([
      { role: 'system', content: `你是需求评审专家。按以下标准检查综合报告：

**评审标准**（必须全部满足）：
1. 章节完整性：必须包含需求概述、可行性结论、风险摘要、下一步建议等核心章节
2. 内容长度：报告总长度与需求复杂度匹配，简单需求不少于 300 字，复杂需求不少于 500 字
3. 风险处理：风险章节必须给出缓解建议，不能只列风险
4. 下一步建议：建议必须具体可执行，不能空洞（如"继续推进"不合格）
5. 逻辑一致性：各章节之间不能有明显矛盾

**输出纯 JSON 对象**（不要包含 markdown 代码块）：
{"pass": true, "critique": ""}

如果全部满足 → pass=true, critique=""
如果任一不满足 → pass=false，给出最关键的 1-2 条具体修改意见
避免主观性评价，只检查核心要素，防止无限循环` },
      { role: 'user', content: `待评审报告：\n\n${state.summary}\n\n请按标准评审。` },
    ]);

    const cleanJson = (response.content as string).trim();
    const jsonStart = Math.min(
      cleanJson.indexOf('{') !== -1 ? cleanJson.indexOf('{') : Infinity,
      cleanJson.indexOf('[') !== -1 ? cleanJson.indexOf('[') : Infinity,
    );
    const jsonStr = jsonStart > 0 ? cleanJson.substring(jsonStart) : cleanJson;

    let result: { pass: boolean; critique: string };
    try {
      result = JSON.parse(jsonStr);
    } catch {
      result = { pass: true, critique: '' };
    }

    console.log(`[Critic子图] criticNode: pass=${result.pass}, critique=${result.critique}`);
    return { critique: result.pass ? '' : result.critique };
  }

  async function refineNode(
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> {
    const response = await model.invoke([
      { role: 'system', content: `你是需求分析师。根据评审意见修订报告。

**修订原则**：
1. 只修改被指出的问题部分
2. 未被批评的章节保持不变
3. 补充缺失的章节或内容
4. 修正逻辑矛盾

**输出要求**：输出完整的修订后报告（包含所有章节），不要只输出修改部分。

**禁止行为**：不要重新生成整个报告、不要删除正确的内容` },
      { role: 'user', content: `原报告：\n${state.summary}\n\n评审意见：\n${state.critique}\n\n请根据评审意见修订报告，只改有问题的地方。` },
    ]);

    const count = state.reviseCount + 1;
    console.log(`[Critic子图] refineNode: reviseCount=${count}`);
    return {
      summary: typeof response.content === 'string' ? response.content : '',
      reviseCount: count,
    };
  }

  function shouldRefine(state: typeof RequirementAnalysisState.State): string {
    if (state.reviseCount >= 2) {
      console.log('[Critic子图] 达到修订上限，强制终止');
      return 'streamFinal';
    }
    if (!state.critique || state.critique.trim() === '') {
      console.log('[Critic子图] 通过评审，完成');
      return 'streamFinal';
    }
    console.log('[Critic子图] 未通过评审，进入 refine');
    return 'refine';
  }

  // 不再调用 LLM，直接逐字推送 state.summary
  async function streamFinalNode(
    state: typeof RequirementAnalysisState.State,
    config: { configurable?: { tokenWriter?: (chunk: string) => void } },
  ): Promise<Partial<typeof RequirementAnalysisState.State>> {
    const writer = config?.configurable?.tokenWriter;
    const content = state.summary;
    if (writer && content) {
      console.log(`[Critic子图] streamFinal: 推送 ${content.length} chars`);
      // 按词分割（保留空格），词的自然长度控制推送节奏
      const words = content.split(/(\s+)/);
      for (const word of words) {
        writer(word);
      }
    } else {
      console.log('[Critic子图] streamFinal: 无 writer，跳过推送');
    }
    return {};
  }

  return new StateGraph(RequirementAnalysisState)
    .addNode('actor', actorNode)
    .addNode('critic', criticNode)
    .addNode('refine', refineNode)
    .addNode('streamFinal', streamFinalNode)
    .addEdge(START, 'actor')
    .addEdge('actor', 'critic')
    .addConditionalEdges('critic', shouldRefine, {
      streamFinal: 'streamFinal',
      refine: 'refine',
    })
    .addEdge('refine', 'critic')
    .addEdge('streamFinal', END)
    .compile();
}

// --- Analysis SubGraph (ReAct) ---
// 原有的 createAnalysisSubGraph 已被 Supervisor + 多专家架构替代，
// 详见 ./experts.ts 中的 createAnalysisSupervisorSubGraph。

// --- Node Factory ---


// --- Helpers ---

const extractText = (chunk: any): string => {
  if (typeof chunk.content === 'string') return chunk.content;
  if (Array.isArray(chunk.content)) return chunk.content.map((c: any) => c.text || '').join('');
  return '';
};

const LLM_TIMEOUT = 100_000;
const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: any;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      console.log(`[LangGraph] TIMEOUT after ${LLM_TIMEOUT}ms: ${label}`);
      reject(new Error(`操作超时: ${label}`));
    }, LLM_TIMEOUT);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// --- clarify helpers ---

interface QuestionItem {
  id: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
  answer: string | null;
  retryCount: number;
  skipped: boolean;
  status: string;
}

function isValidAnswer(text: string): boolean {
  return text.trim().length >= 2;
}

function buildClarifyDone(questions: QuestionItem[]) {
  const data: Record<string, string> = {};
  for (const q of questions) {
    if (q.status === 'answered' && q.answer) data[q.id] = q.answer;
  }
  return { needsClarification: false, clarifiedData: data, questions };
}

function buildClarifyReturn(plan: Record<string, unknown>, nextQ: QuestionItem) {
  return {
    needsClarification: true,
    currentQuestion: nextQ,
    questions: plan.questions as QuestionItem[],
    clarifyPlan: plan,
  };
}

function handleClarifyAnswer(
  plan: Record<string, unknown>,
  answer: { questionId: string; answer: string; source: string },
) {
  const questions = plan.questions as QuestionItem[];
  const idx = (plan.currentQuestionIndex as number) || 0;
  const q = questions[idx];

  if (!q) return buildClarifyDone(questions);

  const valid = answer.source === 'chip' || answer.source === 'multi-select' || answer.source === 'text' || isValidAnswer(answer.answer);

  if (valid) {
    q.answer = answer.answer;
    q.status = 'answered';
    const nextIdx = questions.findIndex((_q, i) => i > idx && _q.status === 'pending');
    if (nextIdx === -1) return buildClarifyDone(questions);
    plan.currentQuestionIndex = nextIdx;
    return buildClarifyReturn(plan, questions[nextIdx]);
  }

  q.retryCount++;
  if (q.retryCount >= 2) {
    q.skipped = true;
    q.status = 'skipped';
    const nextIdx = questions.findIndex((_q, i) => i > idx && _q.status === 'pending');
    if (nextIdx === -1) return buildClarifyDone(questions);
    plan.currentQuestionIndex = nextIdx;
    return buildClarifyReturn(plan, questions[nextIdx]);
  }
  return {
    needsClarification: true,
    currentQuestion: q,
    questions,
    clarifyPlan: plan,
    retryHint: '请提供更详细的回答',
  };
}

// ====== Standalone Nodes (autix-demo 模式) ======

async function triageNodeFn(
  state: typeof RequirementAnalysisState.State,
  config: { model: BaseChatModel },
): Promise<Partial<typeof RequirementAnalysisState.State>> {
  const { model } = config;
  if (state.clarifyAnswer) {
    console.log('[UIChat] triage → analyze (clarify mode, skip triage)');
    return { intent: 'analyze', handoffReason: '' };
  }
  try {
    const structured = model.withStructuredOutput(triageSchema, { method: 'jsonMode' });
    const result = await withTimeout(
      structured.invoke([
        new SystemMessage(`你是需求分诊 Agent。判断用户意图，以 JSON 格式输出。

- 闲聊、问候、简单问答 → action: answer，response 填写直接回复用户的内容
- 需要需求分析、功能评估、方案讨论 → action: handoff_to_analysis，response 设为空字符串
- 只需风险评估、安全审查 → action: handoff_to_risk，response 设为空字符串
交接时给出简要理由。`),
        new HumanMessage(state.input),
      ]),
      'triage',
    );

    if (result.action === 'answer') {
      console.log(`[UIChat] triage → answer | ${(result.response || '').slice(0, 50)}`);
      return {
        messages: [new AIMessage(result.response)],
        intent: 'chat',
        chatResponse: result.response,
        summary: result.response,
        handoffReason: '',
      };
    }

    if (result.action === 'handoff_to_risk') {
      console.log(`[UIChat] triage → risk_only | reason: ${result.reason}`);
      return { intent: 'risk_only', handoffReason: result.reason || '' };
    }

    console.log(`[UIChat] triage → analyze | reason: ${result.reason}`);
    return { intent: 'analyze', handoffReason: result.reason || '' };
  } catch (e) {
    console.log(`[UIChat] triage failed: ${(e as Error).message}, defaulting to analyze`);
    return { intent: 'analyze', handoffReason: '' };
  }
}

async function extractNode(
  state: typeof RequirementAnalysisState.State,
  config: { model: BaseChatModel },
): Promise<Partial<typeof RequirementAnalysisState.State>> {
  const { model } = config;
  if (state.extracted && typeof state.extracted === 'object' && Object.keys(state.extracted).length > 0) {
    console.log('[LangGraph] extractStep: using cached extracted data from checkpoint, skip LLM');
    return {};
  }
  try {
    const t0 = Date.now();
    console.log('[LangGraph] ========== ANALYSIS PIPELINE START ==========');
    const agent = createExtractAgent(model);
    let fullText = '';
    const stream = await withTimeout(agent.stream({ input: state.input }), 'extractStep');
    for await (const chunk of stream) {
      fullText += extractText(chunk);
    }
    const extracted = parseJson(fullText, { title: state.input.slice(0, 50), reqType: 'functional', priority: 'P2', description: state.input, missingFields: ['详细描述'] });
    console.log(`[计时] extractStep 完成，耗时 ${Date.now() - t0}ms`);
    return { extracted: extracted as Record<string, unknown> };
  } catch (e) {
    console.log(`[LangGraph] extractStep: failed - ${(e as Error).message}`);
    return { extracted: { title: state.input.slice(0, 50), reqType: 'functional', priority: 'P2', description: state.input, missingFields: [] } };
  }
}

async function clarifyNodeFn(
  state: typeof RequirementAnalysisState.State,
  config: { model: BaseChatModel },
): Promise<Partial<typeof RequirementAnalysisState.State>> {
  const { model } = config;
  if (state.skipClarify) {
    console.log('[LangGraph] clarifyStep: skip (no conversationId)');
    return { needsClarification: false, clarifiedData: {}, questions: [] };
  }

  const plan = state.clarifyPlan as Record<string, unknown> | null;
  const answer = state.clarifyAnswer;

  if (plan && answer) {
    return handleClarifyAnswer(plan, answer);
  }

  if (plan && !answer) {
    const questions = plan.questions as QuestionItem[];
    const idx = (plan.currentQuestionIndex as number) || 0;
    if (idx < questions.length) {
      return { needsClarification: true, currentQuestion: questions[idx], questions };
    }
    return buildClarifyDone(questions);
  }

  try {
    const t0 = Date.now();
    const agent = createClarifyAgent(model);
    console.log('[LangGraph] clarifyStep: generating question plan...');
    const result = await withTimeout(
      agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) }),
      'clarifyStep',
    );
    const text = typeof result.content === 'string'
      ? result.content
      : Array.isArray(result.content) ? result.content.map((c: any) => c.text || '').join('') : '';
    const parsed = parseJson(text, { questions: [] });
    const rawQuestions: Array<Record<string, unknown>> = parsed.questions || [];
    const questions: QuestionItem[] = rawQuestions.map((q, i) => ({
      id: (q.id as string) || `q${i + 1}`,
      question: (q.question as string) || '',
      options: Array.isArray(q.options) ? q.options as string[] : [],
      multiSelect: (q.multiSelect as boolean) || false,
      answer: null,
      retryCount: 0,
      skipped: false,
      status: 'pending',
    }));

    if (questions.length === 0) {
      console.log(`[计时] clarifyStep 完成 (无需澄清)，耗时 ${Date.now() - t0}ms`);
      return { needsClarification: false, clarifiedData: {}, questions: [] };
    }

    console.log(`[计时] clarifyStep 完成 (${questions.length} 个问题)，耗时 ${Date.now() - t0}ms`);
    const newPlan = { questions, currentQuestionIndex: 0 };
    return { needsClarification: true, currentQuestion: questions[0], questions, clarifyPlan: newPlan };
  } catch (e) {
    console.log(`[LangGraph] clarifyStep: failed - ${(e as Error).message}`);
    return { needsClarification: false, clarifiedData: {}, questions: [] };
  }
}

async function analysisNodeFn(
  state: typeof RequirementAnalysisState.State,
  config: { model: BaseChatModel },
): Promise<Partial<typeof RequirementAnalysisState.State>> {
  const { model } = config;
  try {
    const t0 = Date.now();
    const subGraph = createAnalysisSupervisorSubGraph(model);
    console.log('[LangGraph] analysisStep: invoking supervisor subgraph...');
    const result = await withTimeout(subGraph.invoke({
      input: state.input,
      extracted: state.extracted,
      messages: [],
      toolLoopCount: 0,
      activeExperts: ['functional'],
      functionalAnalysis: '',
      performanceAnalysis: '',
      securityAnalysis: '',
      complianceAnalysis: '',
    }), 'analysisStep');
    const content = result.analysisResult || '';
    console.log(`[计时] analysisStep 完成 (${content.length} chars, experts: [${(result.activeExperts || []).join(', ')}])，耗时 ${Date.now() - t0}ms`);
    return {
      analysisResult: content,
      activeExperts: result.activeExperts,
      functionalAnalysis: result.functionalAnalysis,
      performanceAnalysis: result.performanceAnalysis,
      securityAnalysis: result.securityAnalysis,
      complianceAnalysis: result.complianceAnalysis,
    };
  } catch (e) {
    console.log(`[LangGraph] analysisStep: failed - ${(e as Error).message}`);
    return { analysisResult: '分析服务暂不可用，请稍后重试。' };
  }
}

async function riskNodeFn(
  state: typeof RequirementAnalysisState.State,
  config: { model: BaseChatModel },
): Promise<Partial<typeof RequirementAnalysisState.State>> {
  const { model } = config;
  try {
    const t0 = Date.now();
    const agent = createRiskAgent(model);
    const result = await withTimeout(agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) }), 'riskStep');
    const content = typeof result.content === 'string' ? result.content : '';
    console.log(`[计时] riskStep 完成 (${content.length} chars)，耗时 ${Date.now() - t0}ms`);
    return { riskResult: content || '风险评估暂不可用' };
  } catch (e) {
    console.log(`[LangGraph] riskStep: failed - ${(e as Error).message}`);
    return { riskResult: '风险评估暂不可用。' };
  }
}

// --- Route Function ---

function routeAfterClarify(state: typeof RequirementAnalysisState.State): string | string[] {
  if (state.needsClarification) {
    console.log('[UIChat] route: clarify → END');
    return END;
  }
  console.log('[UIChat] route: clarify → [analysisStep, riskStep] (parallel)');
  return ['analysisStep', 'riskStep'];
}

function routeByIntent(state: typeof RequirementAnalysisState.State): string {
  if (state.intent === 'analyze') return 'extractStep';
  if (state.intent === 'risk_only') return 'riskStep';
  // chat: triage 已直接回答，短路结束
  console.log('[UIChat] route: triage answer → END');
  return END;
}

// --- Graph Factory ---

export function createAnalysisGraph(
  lightModel: BaseChatModel,
  strongModel: BaseChatModel,
  _onProgress?: (step: string, message: string) => void,
  _onToken?: (content: string) => void,
  checkpointer?: MemorySaver,
) {
  const summarySubGraph = createSummarySubGraph(strongModel);

  const builder = new StateGraph(RequirementAnalysisState)
    .addNode('triage', (state) => triageNodeFn(state, { model: lightModel }))
    .addNode('extractStep', (state) => extractNode(state, { model: lightModel }))
    .addNode('clarifyStep', (state) => clarifyNodeFn(state, { model: strongModel }))
    .addNode('analysisStep', (state) => analysisNodeFn(state, { model: lightModel }))
    .addNode('riskStep', (state) => riskNodeFn(state, { model: lightModel }))
    .addNode('summaryStep', summarySubGraph)
    // edges
    .addEdge(START, 'triage')
    .addConditionalEdges('triage', routeByIntent, {
      extractStep: 'extractStep',
      riskStep: 'riskStep',
      [END]: END,
    })
    .addEdge('extractStep', 'clarifyStep')
    .addConditionalEdges('clarifyStep', routeAfterClarify, {
      analysisStep: 'analysisStep',
      riskStep: 'riskStep',
      [END]: END,
    })
    .addEdge('analysisStep', 'summaryStep')
    .addEdge('riskStep', 'summaryStep')
    .addEdge('summaryStep', END);

  return checkpointer
    ? builder.compile({ checkpointer })
    : builder.compile();
}

// --- Output Type ---

export interface RunAnalysisGraphOutput {
  intent: 'analyze' | 'chat' | 'risk_only';
  summary: string;
  extracted?: Record<string, unknown>;
  clarified?: { needsClarification: boolean; questions: string[] };
  needsClarification?: boolean;
  currentQuestion?: { id: string; question: string; options: string[] } | null;
  questions?: { id: string; question: string; options: string[]; answer: string | null; retryCount: number; skipped: boolean; status: string }[];
  clarifiedData?: Record<string, string>;
  retryHint?: string;
  analysisResult?: string;
  riskResult?: string;
  chatResponse?: string;
  // Multi-Agent 专家相关字段
  functionalAnalysis?: string;
  performanceAnalysis?: string;
  securityAnalysis?: string;
  complianceAnalysis?: string;
  activeExperts?: string[];
  steps: Record<string, string>;
}

// --- Runner ---

export async function runAnalysisGraph(args: {
  input?: string;
  retrievedContext: string;
  lightModel: BaseChatModel;
  strongModel: BaseChatModel;
  history?: { role: 'user' | 'assistant'; content: string }[];
  threadId?: string;
  clarifyAnswer?: { questionId: string; answer: string; source: string } | null;
  skipClarify?: boolean;
  onProgress?: (step: string, message: string) => void;
  onToken?: (content: string) => void;
}): Promise<RunAnalysisGraphOutput> {
  const useCheckpoint = !!args.threadId;
  const graph = createAnalysisGraph(
    args.lightModel,
    args.strongModel,
    args.onProgress,
    args.onToken,
    useCheckpoint ? hitlCheckpointer : undefined,
  );

  const config = useCheckpoint
    ? { configurable: { thread_id: args.threadId } }
    : undefined;

  // 澄清回答：先 updateState 写入答案，再 invoke(null) 恢复
  if (useCheckpoint && args.clarifyAnswer) {
    await graph.updateState(config!, { clarifyAnswer: args.clarifyAnswer });
  }

  const result = await graph.invoke(
    useCheckpoint && args.clarifyAnswer
      ? { input: args.input || '' }  // resume: 最小 state，其余从 checkpoint 恢复
      : {
          input: args.input || '',
          retrievedContext: args.retrievedContext,
          history: args.history || [],
          messages: [],
          skipClarify: args.skipClarify || false,
        },
    config,
  );

  const intent = (result.intent as 'analyze' | 'query' | 'chat' | 'risk_only') || 'analyze';

  const steps: Record<string, string> = { triage: intent };

  if (intent === 'analyze') {
    steps.extract = JSON.stringify(result.extracted ?? {});
    steps.clarify = JSON.stringify(result.clarified ?? {});
    steps.analysis = result.analysisResult ?? '';
    steps.risk = result.riskResult ?? '';
    steps.summary = result.summary ?? '';
  } else if (intent === 'risk_only') {
    steps.risk = result.riskResult ?? '';
    steps.summary = result.summary ?? '';
  } else {
    steps.chat = result.chatResponse ?? '';
  }

  // 构建专家字段（仅 analyze 意图）
  const expertFields = intent === 'analyze' ? {
    functionalAnalysis: (result.functionalAnalysis as string) ?? '',
    performanceAnalysis: (result.performanceAnalysis as string) ?? '',
    securityAnalysis: (result.securityAnalysis as string) ?? '',
    complianceAnalysis: (result.complianceAnalysis as string) ?? '',
    activeExperts: (result.activeExperts as string[]) ?? [],
  } : {};

  return {
    intent,
    summary: result.summary ?? '',
    extracted: intent === 'analyze' ? (result.extracted as Record<string, unknown>) ?? {} : undefined,
    clarified: intent === 'analyze' ? (result.clarified as { needsClarification: boolean; questions: string[] }) ?? { needsClarification: false, questions: [] } : undefined,
    needsClarification: intent === 'analyze' ? (result.needsClarification as boolean) ?? false : undefined,
    currentQuestion: intent === 'analyze' ? (result.currentQuestion as RunAnalysisGraphOutput['currentQuestion']) ?? null : undefined,
    questions: intent === 'analyze' ? (result.questions as RunAnalysisGraphOutput['questions']) ?? [] : undefined,
    clarifiedData: intent === 'analyze' ? (result.clarifiedData as Record<string, string>) ?? {} : undefined,
    retryHint: intent === 'analyze' ? (result.retryHint as string) ?? '' : undefined,
    analysisResult: intent === 'analyze' ? (result.analysisResult as string) ?? '' : undefined,
    riskResult: intent === 'analyze' ? (result.riskResult as string) ?? '' : undefined,
    queryResponse: intent === 'query' ? (result.queryResponse as string) ?? '' : undefined,
    chatResponse: intent === 'chat' ? (result.chatResponse as string) ?? '' : undefined,
    ...expertFields,
    steps,
  };
}

// --- Stream Types ---

/** 图流式事件类型 */
export type GraphStreamEvent =
  | { type: 'node_start'; node: string }
  | { type: 'token'; content: string; node: string }
  | { type: 'node_end'; node: string; output?: unknown }
  | { type: 'log'; level: 'info' | 'debug' | 'error'; message: string; data?: Record<string, unknown> }
  | { type: 'complete'; result: RunAnalysisGraphOutput };

// --- Stream Runner ---

/** 内部节点名（在 streamEvents 中过滤掉不产生 node_start/node_end 事件） */
const INTERNAL_NODES = [
  'RunnableSequence', 'StateGraph', 'LangGraph',
  'RunnableLambda', '__start__', '__end__',
  'agent', 'tools', 'finalize',           // ReAct subgraph internals (shared by all experts)
  'supervisor', 'aggregator',             // Supervisor subgraph internal nodes
  'functional_expert', 'performance_expert',  // Expert compiled subgraphs (not streamed)
  'security_expert', 'compliance_expert',
  'actor', 'critic', 'refine', 'streamFinal', // Critic-Refine subgraph internals
];

/** 不流式输出 token 的节点（JSON 输出 + invoke-only + subgraph） */
const SKIP_TOKEN_NODES = ['triage', 'extractStep', 'clarifyStep', 'analysisStep', 'riskStep', 'summaryStep'];

/**
 * 流式运行需求分析图。
 * 使用 LangGraph streamEvents API 实现 token 级流式输出。
 */
export async function* streamAnalysisGraph(args: {
  input?: string;
  retrievedContext: string;
  lightModel: BaseChatModel;
  strongModel: BaseChatModel;
  history?: { role: 'user' | 'assistant'; content: string }[];
  threadId?: string;
  clarifyAnswer?: { questionId: string; answer: string; source: string } | null;
  skipClarify?: boolean;
  tokenWriter?: (chunk: string) => void;
}): AsyncGenerator<GraphStreamEvent> {
  const { input, retrievedContext, lightModel, strongModel, tokenWriter } = args;
  const useCheckpoint = !!args.threadId;

  // 创建图（注入 checkpointer 以支持跨请求状态保持）
  const graph = createAnalysisGraph(
    lightModel,
    strongModel,
    undefined,
    undefined,
    useCheckpoint ? hitlCheckpointer : undefined,
  );

  const visitedNodes = new Set<string>();
  let currentNode: string | null = null;
  // 累积各节点的 partial state 输出，避免依赖 streamEvents 的 top-level finalState
  const accumulated: Record<string, unknown> = {};

  const configurable: Record<string, unknown> = {};
  if (useCheckpoint) configurable.thread_id = args.threadId;
  if (tokenWriter) configurable.tokenWriter = tokenWriter;

  const config = Object.keys(configurable).length > 0
    ? { configurable }
    : undefined;

  try {
    // 澄清回答：先 updateState 写入答案，再 invoke 恢复
    if (useCheckpoint && args.clarifyAnswer) {
      await graph.updateState(config!, { clarifyAnswer: args.clarifyAnswer });
    }

    // resume 时不传 null（避免 streamEvents 不识别 checkpoint），传最小 state
    const initialState = useCheckpoint && args.clarifyAnswer
      ? { input: input || '' }
      : {
          input: input || '',
          retrievedContext,
          history: args.history || [],
          messages: [],
          skipClarify: args.skipClarify || false,
        };

    const eventStream = graph.streamEvents(
      initialState,
      { version: 'v2', configurable },
    );

    for await (const event of eventStream) {
      // 节点开始
      if (event.event === 'on_chain_start') {
        const name = event.name;
        if (name && !INTERNAL_NODES.some((n) => name.includes(n)) && !visitedNodes.has(name)) {
          visitedNodes.add(name);
          currentNode = name;
          yield { type: 'node_start', node: name };
        }
      }

      // LLM token 流
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk;
        const content = typeof chunk?.content === 'string'
          ? chunk.content
          : Array.isArray(chunk?.content)
            ? chunk.content.map((c: any) => c.text || '').join('')
            : '';
        if (content && currentNode && !SKIP_TOKEN_NODES.includes(currentNode)) {
          yield { type: 'token', content, node: currentNode };
        }
      }

      // 节点完成 → 累积 partial state
      if (event.event === 'on_chain_end') {
        const name = event.name;
        if (name && visitedNodes.has(name)) {
          const output = event.data?.output;
          yield { type: 'node_end', node: name, output };
          // 合并节点输出到累积状态
          if (output && typeof output === 'object' && !Array.isArray(output)) {
            Object.assign(accumulated, output);
          }
        }
      }
    }

    // 从累积状态构建结果（不再 fallback invoke）
    const result = accumulated as unknown as typeof RequirementAnalysisState.State;
    const intent = (result.intent as 'analyze' | 'query' | 'chat' | 'risk_only') || 'analyze';

    yield {
      type: 'log',
      level: 'info',
      message: 'graph 执行完成',
      data: { intent, hasSummary: !!result.summary },
    };

    // 构建步骤
    const steps: Record<string, string> = { triage: intent };
    if (intent === 'analyze') {
      steps.extract = JSON.stringify(result.extracted ?? {});
      steps.clarify = JSON.stringify(result.clarified ?? {});
      if (!result.needsClarification) {
        steps.analysis = result.analysisResult ?? '';
        steps.risk = result.riskResult ?? '';
        steps.summary = result.summary ?? '';
      }
    } else if (intent === 'risk_only') {
      steps.risk = result.riskResult ?? '';
      steps.summary = result.summary ?? '';
    } else {
      steps.chat = result.chatResponse ?? '';
    }

    // 构建专家字段（仅 analyze 意图 + 非澄清模式）
    const expertFields = (intent === 'analyze' && !result.needsClarification) ? {
      functionalAnalysis: (result.functionalAnalysis as string) ?? '',
      performanceAnalysis: (result.performanceAnalysis as string) ?? '',
      securityAnalysis: (result.securityAnalysis as string) ?? '',
      complianceAnalysis: (result.complianceAnalysis as string) ?? '',
      activeExperts: (result.activeExperts as string[]) ?? [],
    } : {};

    const finalResult: RunAnalysisGraphOutput = {
      intent,
      summary: result.summary ?? '',
      extracted: intent === 'analyze' ? (result.extracted as Record<string, unknown>) ?? {} : undefined,
      clarified: intent === 'analyze' ? (result.clarified as { needsClarification: boolean; questions: string[] }) ?? { needsClarification: false, questions: [] } : undefined,
      needsClarification: intent === 'analyze' ? (result.needsClarification as boolean) ?? false : undefined,
      currentQuestion: intent === 'analyze' ? (result.currentQuestion as RunAnalysisGraphOutput['currentQuestion']) ?? null : undefined,
      questions: intent === 'analyze' ? (result.questions as RunAnalysisGraphOutput['questions']) ?? [] : undefined,
      clarifiedData: intent === 'analyze' ? (result.clarifiedData as Record<string, string>) ?? {} : undefined,
      retryHint: intent === 'analyze' ? (result.retryHint as string) ?? '' : undefined,
      analysisResult: intent === 'analyze' ? (result.analysisResult as string) ?? '' : undefined,
      riskResult: (intent === 'analyze' || intent === 'risk_only') ? (result.riskResult as string) ?? '' : undefined,
      chatResponse: (intent === 'chat' || intent === 'risk_only') ? (result.chatResponse || result.summary as string) ?? '' : undefined,
      ...expertFields,
      steps,
    };

    yield { type: 'complete', result: finalResult };

    yield {
      type: 'log',
      level: 'info',
      message: 'streamAnalysisGraph 完成',
      data: { intent, summaryLength: finalResult.summary.length },
    };
  } catch (err) {
    yield {
      type: 'log',
      level: 'error',
      message: 'streamAnalysisGraph 执行失败',
      data: { error: err instanceof Error ? err.message : String(err) },
    };
    throw err;
  }
}

// --- HITL Checkpointer ---

/**
 * 共享 MemorySaver，同一 thread_id 的 checkpoint 在多次调用间保持。
 * 生产环境可替换为 PostgresSaver（接口等价）。
 */
export const hitlCheckpointer = new MemorySaver();
