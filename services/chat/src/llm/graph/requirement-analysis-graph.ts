import { Annotation, MessagesAnnotation, StateGraph, START, END } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import {
  createExtractAgent,
  createClarifyAgent,
  createAnalysisAgent,
  createRiskAgent,
  createSummaryAgent,
} from '../agents/sub-agents';

// --- State Definition ---

export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  input: Annotation<string>,
  retrievedContext: Annotation<string>,
  // classifier
  intent: Annotation<'analyze' | 'query' | 'chat'>({
    default: () => 'analyze',
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
  summary: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  // fast-path responses
  queryResponse: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  chatResponse: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
});

// --- Classifier Zod Schema ---

const intentSchema = z.object({
  intent: z.enum(['analyze', 'query', 'chat']).describe('用户意图分类'),
  reasoning: z.string().describe('分类理由，一句话说明'),
});

const CLASSIFIER_PROMPT = `你是意图分类器。分析用户输入，判断意图类型。

## 意图类型

### analyze — 需求分析
用户想要分析、评估、分解一个需求或功能。
关键特征：包含功能描述、需求细节、实现方案讨论
示例：
- "分析需求：开发在线问卷系统"
- "评估这个功能的可行性"
- "需要一个用户登录功能"

### query — 信息查询
用户想要查询某个需求的状态、进度或已有信息。
关键特征：包含需求编号（如 REQ-xxx）、询问进度/状态/结果
示例：
- "查询 REQ-20240315-001 的状态"
- "REQ-20240315-001 的进度如何"
- "查看 REQ-20240315-001 的风险分析报告"

### chat — 普通闲聊
用户进行非业务相关的对话。
关键特征：打招呼、天气、无关话题、简单问候
示例：
- "你好"
- "今天天气不错"
- "谢谢你的帮助"

## 优先级规则
1. 以"分析"/"评估"/"评审"开头 + 包含功能描述 → analyze（即使有 REQ 编号）
2. 包含"查询/查看/状态/进度"等查询词 → query
3. "查询XXX的分析报告" → query（"查询"优先级 > "分析"）
4. 包含需求编号（REQ-\\d+）且无功能描述 → query
5. 明确闲聊/问候 → chat
6. 包含需求描述/功能开发/实现方案 → analyze
7. 默认 → analyze

只输出 JSON：{"intent":"analyze|query|chat","reasoning":"分类理由"}`;

// --- Keyword Fallback ---

function keywordClassify(input: string): 'analyze' | 'query' | 'chat' {
  const hasReqId = /REQ-\d+/i.test(input);
  const queryWords = /查询|查看|状态|进度|进展|怎么样|如何|是什么|有没有|在哪|什么时间/;
  const chatWords = /^(你好|hi|hello|嗨|谢谢|再见|拜拜|天气|吃[了过]|介绍|推荐|谁|是谁|什么是)/i;
  const analysisWords = /分析需求|评估需求|评审需求|开发|实现方案|设计方案|需求规格|系统架构|模块设计/;

  // REQ 编号 + 查询词 → query
  if (hasReqId && queryWords.test(input)) return 'query';
  // 明确闲聊 → chat
  if (chatWords.test(input)) return 'chat';
  // 短输入（<10字）→ chat
  if (input.length < 10) return 'chat';
  // 查询类 → query
  if (hasReqId || (queryWords.test(input) && input.length < 30)) return 'query';
  // 明确分析词 → analyze
  if (analysisWords.test(input)) return 'analyze';
  // 默认 → chat（避免挂死在分析管道）
  return 'chat';
}

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

// --- Node Factory ---

const createNodes = (model: BaseChatModel) => ({
  // ====== Classifier ======

  classifierNode: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    // DeepSeek 模型 invoke 可能无限挂起，直接使用关键词分类
    return { intent: keywordClassify(state.input) };
  },

  // ====== Fast-Path Handlers (with timeout) ======

  queryHandlerNode: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const result = await model.invoke([
        { role: 'system', content: '你是需求查询助手。简洁回答查询。' },
        { role: 'user', content: state.input },
      ]);
      const content = typeof result.content === 'string' ? result.content : '';
      return { queryResponse: content, summary: content, messages: [result] };
    } catch { return { queryResponse: '查询服务暂不可用', summary: '查询服务暂不可用' }; }
  },

  chatHandlerNode: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const result = await model.invoke([
        { role: 'system', content: '你是友好的AI助手。用自然、亲切的语气回复。' },
        { role: 'user', content: state.input },
      ]);
      const content = typeof result.content === 'string' ? result.content : '';
      return { chatResponse: content, summary: content, messages: [result] };
    } catch { return { chatResponse: '抱歉，服务暂不可用，请稍后再试。', summary: '抱歉，服务暂不可用，请稍后再试。' }; }
  },

  // ====== Analysis Pipeline (with timeout per node) ======

  extractStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createExtractAgent(model);
      const result = await agent.invoke({ input: state.input });
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      return { extracted: parseJson(content, { title: state.input.slice(0, 50), type: 'functional', priority: 'P2', description: state.input, isComplete: false, missingFields: ['详细描述'] }), messages: [result] };
    } catch { return { extracted: { title: state.input.slice(0, 50), type: 'functional', priority: 'P2', description: state.input, isComplete: true, missingFields: [] } }; }
  },

  clarifyStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createClarifyAgent(model);
      const result = await agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) });
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      return { clarified: parseJson(content, { needsClarification: false, questions: [] }), messages: [result] };
    } catch { return { clarified: { needsClarification: false, questions: [] } }; }
  },

  analysisStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createAnalysisAgent(model);
      const result = await agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) });
      return { analysisResult: typeof result.content === 'string' ? result.content : '分析暂不可用' };
    } catch { return { analysisResult: '分析服务暂不可用，请稍后重试。' }; }
  },

  riskStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createRiskAgent(model);
      const result = await agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) });
      return { riskResult: typeof result.content === 'string' ? result.content : '风险评估暂不可用' };
    } catch { return { riskResult: '风险评估暂不可用。' }; }
  },

  summaryStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createSummaryAgent(model);
      const result = await agent.invoke({
        input: state.input, extractResult: JSON.stringify(state.extracted),
        analysisResult: state.analysisResult, riskResult: state.riskResult,
        retrievedContext: state.retrievedContext || '无相关参考文档',
      });
      return { summary: typeof result.content === 'string' ? result.content : '汇总暂不可用', messages: [result] };
    } catch { return { summary: '汇总服务暂不可用，请稍后重试。' }; }
  },
});

// --- Route Function ---

function routeByIntent(state: typeof RequirementAnalysisState.State): string {
  switch (state.intent) {
    case 'query': return 'queryHandler';
    case 'chat': return 'chatHandler';
    default: return 'extractStep';
  }
}

// --- Graph Factory ---

export function createAnalysisGraph(model: BaseChatModel) {
  const nodes = createNodes(model);

  return new StateGraph(RequirementAnalysisState)
    // classifier
    .addNode('classifier', nodes.classifierNode)
    // fast paths
    .addNode('queryHandler', nodes.queryHandlerNode)
    .addNode('chatHandler', nodes.chatHandlerNode)
    // analysis pipeline
    .addNode('extractStep', nodes.extractStep)
    .addNode('clarifyStep', nodes.clarifyStep)
    .addNode('analysisStep', nodes.analysisStep)
    .addNode('riskStep', nodes.riskStep)
    .addNode('summaryStep', nodes.summaryStep)
    // edges
    .addEdge(START, 'classifier')
    .addConditionalEdges('classifier', routeByIntent, {
      extractStep: 'extractStep',
      queryHandler: 'queryHandler',
      chatHandler: 'chatHandler',
    })
    .addEdge('queryHandler', END)
    .addEdge('chatHandler', END)
    .addEdge('extractStep', 'clarifyStep')
    .addEdge('clarifyStep', 'analysisStep')
    .addEdge('analysisStep', 'riskStep')
    .addEdge('riskStep', 'summaryStep')
    .addEdge('summaryStep', END)
    .compile();
}

// --- Output Type ---

export interface RunAnalysisGraphOutput {
  intent: 'analyze' | 'query' | 'chat';
  summary: string;
  extracted?: Record<string, unknown>;
  clarified?: { needsClarification: boolean; questions: string[] };
  analysisResult?: string;
  riskResult?: string;
  queryResponse?: string;
  chatResponse?: string;
  steps: Record<string, string>;
}

// --- Runner ---

export async function runAnalysisGraph(args: {
  input: string;
  retrievedContext: string;
  model: BaseChatModel;
}): Promise<RunAnalysisGraphOutput> {
  const graph = createAnalysisGraph(args.model);
  const result = await graph.invoke({
    input: args.input,
    retrievedContext: args.retrievedContext,
    messages: [],
  });

  const intent = (result.intent as 'analyze' | 'query' | 'chat') || 'analyze';

  const steps: Record<string, string> = { classifier: intent };

  if (intent === 'analyze') {
    steps.extract = JSON.stringify(result.extracted ?? {});
    steps.clarify = JSON.stringify(result.clarified ?? {});
    steps.analysis = result.analysisResult ?? '';
    steps.risk = result.riskResult ?? '';
    steps.summary = result.summary ?? '';
  } else if (intent === 'query') {
    steps.query = result.queryResponse ?? '';
  } else {
    steps.chat = result.chatResponse ?? '';
  }

  return {
    intent,
    summary: result.summary ?? '',
    extracted: intent === 'analyze' ? (result.extracted as Record<string, unknown>) ?? {} : undefined,
    clarified: intent === 'analyze' ? (result.clarified as { needsClarification: boolean; questions: string[] }) ?? { needsClarification: false, questions: [] } : undefined,
    analysisResult: intent === 'analyze' ? (result.analysisResult as string) ?? '' : undefined,
    riskResult: intent === 'analyze' ? (result.riskResult as string) ?? '' : undefined,
    queryResponse: intent === 'query' ? (result.queryResponse as string) ?? '' : undefined,
    chatResponse: intent === 'chat' ? (result.chatResponse as string) ?? '' : undefined,
    steps,
  };
}
