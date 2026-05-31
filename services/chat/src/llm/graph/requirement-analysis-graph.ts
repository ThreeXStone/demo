import { Annotation, MessagesAnnotation, StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool } from '@langchain/core/tools';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  createExtractAgent,
  createClarifyAgent,
  createRiskAgent,
  createSummaryAgent,
} from '../agents/sub-agents';

// --- State Definition ---

export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  input: Annotation<string>,
  retrievedContext: Annotation<string>,
  history: Annotation<{ role: 'user' | 'assistant'; content: string }[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),
  // classifier
  intent: Annotation<'analyze' | 'query' | 'chat'>({
    default: () => 'chat',
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
  const analysisWords = /需求分析|分析需求|需求评估|评估需求|需求评审|评审需求|需求设计|设计方案|实现方案|需求规格|系统架构|模块设计|功能需求|需求描述|开发|登录模块|注册模块|用户模块/;

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
  // 包含"需求"关键词 → analyze
  if (/需求/.test(input)) return 'analyze';
  // 默认 → chat
  return 'chat';
}

function classifyAndLog(input: string): 'analyze' | 'query' | 'chat' {
  const intent = keywordClassify(input);
  console.log(`[LangGraph] classify: "${input.slice(0, 80)}" → ${intent}`);
  return intent;
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

// --- Mock Tools ---

const searchRequirementTool = tool(
  (input) => {
    const { reqId } = input as { reqId: string };
    console.log(`[LangGraph] searchRequirement called with reqId: ${reqId}`);
    return JSON.stringify({
      reqId,
      title: '示例需求：用户认证模块',
      type: 'functional',
      priority: 'P1',
      description: '实现基于JWT的用户登录、注册、密码重置功能',
      acceptanceCriteria: '用户可通过邮箱注册并登录；密码至少8位含大小写字母和数字；支持密码重置',
      status: 'reviewing',
      dependencies: ['邮件服务', '短信网关'],
    });
  },
  {
    name: 'search_requirement',
    description: '根据需求编号查询需求详情。输入 reqId（如 REQ-001），返回需求的完整信息。',
    schema: z.object({
      reqId: z.string().describe('需求编号，如 REQ-001'),
    }),
  },
);

const analysisTools = [searchRequirementTool];

// --- Analysis SubGraph (ReAct) ---

const ANALYSIS_SYSTEM_PROMPT = `你是资深需求分析专家。根据用户输入和已抽取的需求信息，生成深度分析报告。

## 可用工具
- **search_requirement**：查询已有需求的详细信息。当用户输入或上下文中包含需求编号（如 REQ-XXX）时，应调用此工具获取详情后再分析。

## 分析要求
输出完整的 Markdown 分析报告，必须包含：
1. **功能分解**：将需求拆解为可执行的子功能
2. **用户故事**：为每个子功能编写 Given-When-Then 格式的用户故事
3. **验收标准**：可量化的验收条件
4. **技术复杂度评估**：从低/中/高评估，并说明理由

## 工具调用规则
- 只有当输入中包含明确的需求编号时才调用 search_requirement
- 获取足够信息后直接输出分析结论，不要重复调用同一工具
- 对相同参数禁止重复调用工具`;

function createAnalysisSubGraph(model: BaseChatModel) {
  if (!model.bindTools) throw new Error('当前模型不支持工具调用');
  const modelWithTools = model.bindTools(analysisTools);

  const subgraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      default: () => [],
      reducer: (a, b) => a.concat(b),
    }),
    extracted: Annotation<Record<string, unknown>>({
      default: () => ({}),
      reducer: (_, next) => next,
    }),
    toolLoopCount: Annotation<number>({
      default: () => 0,
      reducer: (_, next) => next,
    }),
    analysisResult: Annotation<string>({
      default: () => '',
      reducer: (_, next) => next,
    }),
  });

  const MAX_TOOL_LOOPS = 6;

  const logTS = () => new Date().toISOString();

  const agentNode = async (state: typeof subgraphState.State) => {
    const loop = state.toolLoopCount + 1;
    console.log(`[LangGraph] ${logTS()} | ReAct AGENT_START  | round ${loop}/${MAX_TOOL_LOOPS} | msgs=${state.messages.length}`);
    const t0 = Date.now();

    const messages = state.messages.length === 0
      ? [
          new SystemMessage(ANALYSIS_SYSTEM_PROMPT),
          new HumanMessage(`用户输入：\n需求抽取结果：${JSON.stringify(state.extracted)}`),
        ]
      : state.messages;

    const response = await modelWithTools.invoke(messages);
    const elapsed = Date.now() - t0;
    const tcCount = (response as any).tool_calls?.length || 0;
    console.log(`[LangGraph] ${logTS()} | ReAct AGENT_DONE   | round ${loop} | ${elapsed}ms | tool_calls=${tcCount} | contentLen=${typeof response.content === 'string' ? response.content.length : 0}`);
    return { messages: [response], toolLoopCount: loop };
  };

  const toolsNode = new ToolNode(analysisTools);

  const finalizeNode = (state: typeof subgraphState.State) => {
    const lastAi = [...state.messages].reverse().find((m) => m._getType() === 'ai');
    const content = typeof lastAi?.content === 'string' ? lastAi.content : '';
    console.log(`[LangGraph] ${logTS()} | ReAct FINALIZE     | loops=${state.toolLoopCount} | resultLen=${content.length}`);
    return { analysisResult: content || '分析服务暂不可用，请稍后重试。' };
  };

  const routeAfterAgent = (state: typeof subgraphState.State): string => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (state.toolLoopCount >= MAX_TOOL_LOOPS) {
      console.log(`[LangGraph] ${logTS()} | ReAct ROUTE        | max loops (${state.toolLoopCount}) → finalize`);
      return 'finalize';
    }
    const isAi = lastMsg._getType() === 'ai';
    const hasToolCalls = isAi && 'tool_calls' in lastMsg && (lastMsg as any).tool_calls?.length > 0;
    if (hasToolCalls) {
      const tcNames = (lastMsg as any).tool_calls.map((tc: any) => tc.name).join(', ');
      console.log(`[LangGraph] ${logTS()} | ReAct ROUTE        | tool_calls: [${tcNames}] → tools`);
      return 'tools';
    }
    console.log(`[LangGraph] ${logTS()} | ReAct ROUTE        | no tool calls → finalize`);
    return 'finalize';
  };

  return new StateGraph(subgraphState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent, { tools: 'tools', finalize: 'finalize' })
    .addEdge('tools', 'agent')
    .addEdge('finalize', END)
    .compile();
}


// --- Node Factory ---


const createNodes = (model: BaseChatModel, onProgress?: (step: string, message: string) => void) => {

  // Timeout wrapper: reject if LLM call exceeds limit
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


  return {
  // ====== Classifier ======

  classifierNode: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    // DeepSeek 模型 invoke 可能无限挂起，直接使用关键词分类
    const intent = classifyAndLog(state.input);
    onProgress?.('classifier', '意图识别完成');
    return { intent };
  },

  // ====== Fast-Path Handlers (with timeout) ======

  queryHandlerNode: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      console.log(`[LangGraph] queryHandler: invoking LLM...`);
      const result = await withTimeout(model.invoke([
        { role: 'system', content: '你是需求查询助手。简洁回答查询。' },
        ...state.history,
        { role: 'user', content: state.input },
      ]), 'queryHandler');
      const content = typeof result.content === 'string' ? result.content : '';
      console.log(`[LangGraph] queryHandler: LLM responded (${content.length} chars)`);
      onProgress?.('queryHandler', '查询完成');
      return { queryResponse: content, summary: content, messages: [result] };
    } catch (e) {
      console.log(`[LangGraph] queryHandler: failed - ${(e as Error).message}`);
      return { queryResponse: '查询服务暂不可用', summary: '查询服务暂不可用' };
    }
  },

  chatHandlerNode: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      console.log(`[LangGraph] chatHandler: invoking LLM...`);
      const result = await withTimeout(model.invoke([
        { role: 'system', content: '你是友好的AI助手。用自然、亲切的语气回复。' },
        ...state.history,
        { role: 'user', content: state.input },
      ]), 'chatHandler');
      const content = typeof result.content === 'string' ? result.content : '';
      console.log(`[LangGraph] chatHandler: LLM responded (${content.length} chars)`);
      onProgress?.('chatHandler', '对话完成');
      return { chatResponse: content, summary: content, messages: [result] };
    } catch (e) {
      console.log(`[LangGraph] chatHandler: failed - ${(e as Error).message}`);
      return { chatResponse: '抱歉，服务暂不可用，请稍后再试。', summary: '抱歉，服务暂不可用，请稍后再试。' };
    }
  },

  // ====== Analysis Pipeline (with timeout per node) ======

  extractStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createExtractAgent(model);
      console.log(`[LangGraph] extractStep: invoking LLM...`);
      const result = await withTimeout(agent.invoke({ input: state.input }), 'extractStep');
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      console.log(`[LangGraph] extractStep: LLM responded (${content.length} chars)`);
      onProgress?.('extractStep', '需求信息抽取完成');
      return { extracted: parseJson(content, { title: state.input.slice(0, 50), type: 'functional', priority: 'P2', description: state.input, isComplete: false, missingFields: ['详细描述'] }), messages: [result] };
    } catch (e) {
      console.log(`[LangGraph] extractStep: failed - ${(e as Error).message}`);
      return { extracted: { title: state.input.slice(0, 50), type: 'functional', priority: 'P2', description: state.input, isComplete: true, missingFields: [] } };
    }
  },

  clarifyStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createClarifyAgent(model);
      console.log(`[LangGraph] clarifyStep: invoking LLM...`);
      const result = await withTimeout(agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) }), 'clarifyStep');
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      console.log(`[LangGraph] clarifyStep: LLM responded (${content.length} chars)`);
      onProgress?.('clarifyStep', '需求澄清分析完成');
      return { clarified: parseJson(content, { needsClarification: false, questions: [] }), messages: [result] };
    } catch (e) {
      console.log(`[LangGraph] clarifyStep: failed - ${(e as Error).message}`);
      return { clarified: { needsClarification: false, questions: [] } };
    }
  },

  analysisStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const subGraph = createAnalysisSubGraph(model);
      console.log(`[LangGraph] analysisStep: invoking ReAct subgraph...`);
      const result = await withTimeout(subGraph.invoke({
        messages: [],
        extracted: state.extracted,
        toolLoopCount: 0,
        analysisResult: '',
      }), 'analysisStep');
      const content = result.analysisResult || '';
      console.log(`[LangGraph] analysisStep: subgraph done (${content.length} chars, ${result.toolLoopCount} tool loops)`);
      onProgress?.('analysisStep', '需求深度分析完成');
      return { analysisResult: content, toolLoopCount: result.toolLoopCount };
    } catch (e) {
      console.log(`[LangGraph] analysisStep: failed - ${(e as Error).message}`);
      return { analysisResult: '分析服务暂不可用，请稍后重试。' };
    }
  },

  riskStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createRiskAgent(model);
      console.log(`[LangGraph] riskStep: invoking LLM...`);
      const result = await withTimeout(agent.invoke({ input: state.input, extractResult: JSON.stringify(state.extracted) }), 'riskStep');
      const content = typeof result.content === 'string' ? result.content : '';
      console.log(`[LangGraph] riskStep: LLM responded (${content.length} chars)`);
      onProgress?.('riskStep', '风险评估完成');
      return { riskResult: content || '风险评估暂不可用' };
    } catch (e) {
      console.log(`[LangGraph] riskStep: failed - ${(e as Error).message}`);
      return { riskResult: '风险评估暂不可用。' };
    }
  },

  summaryStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const agent = createSummaryAgent(model);
      console.log(`[LangGraph] summaryStep: invoking LLM...`);
      const result = await withTimeout(agent.invoke({
        input: state.input, extractResult: JSON.stringify(state.extracted),
        analysisResult: state.analysisResult, riskResult: state.riskResult,
        retrievedContext: state.retrievedContext || '无相关参考文档',
      }), 'summaryStep');
      const content = typeof result.content === 'string' ? result.content : '';
      console.log(`[LangGraph] summaryStep: LLM responded (${content.length} chars)`);
      onProgress?.('summaryStep', '汇总报告生成中...');
      return { summary: content || '汇总暂不可用', messages: [result] };
    } catch (e) {
      console.log(`[LangGraph] summaryStep: failed - ${(e as Error).message}`);
      return { summary: '汇总服务暂不可用，请稍后重试。' };
    }
  },
  };
};

// --- Route Function ---

function routeByIntent(state: typeof RequirementAnalysisState.State): string {
  switch (state.intent) {
    case 'query': return 'queryHandler';
    case 'chat': return 'chatHandler';
    default: return 'extractStep';
  }
}

// --- Graph Factory ---

export function createAnalysisGraph(model: BaseChatModel, onProgress?: (step: string, message: string) => void) {
  const nodes = createNodes(model, onProgress);

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
  history?: { role: 'user' | 'assistant'; content: string }[];
  onProgress?: (step: string, message: string) => void;
}): Promise<RunAnalysisGraphOutput> {
  console.log(`[LangGraph] ========== GRAPH START ==========`);
  console.log(`[LangGraph] input: "${args.input.slice(0, 100)}"`);
  console.log(`[LangGraph] model: ${(args.model as any).model || 'unknown'}`);

  const graph = createAnalysisGraph(args.model, args.onProgress);
  const t0 = Date.now();
  const result = await graph.invoke({
    input: args.input,
    retrievedContext: args.retrievedContext,
    history: args.history || [],
    messages: [],
  });
  const totalElapsed = Date.now() - t0;

  const intent = (result.intent as 'analyze' | 'query' | 'chat') || 'analyze';
  console.log(`[LangGraph] intent classified: ${intent} | totalTime: ${totalElapsed}ms`);

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
