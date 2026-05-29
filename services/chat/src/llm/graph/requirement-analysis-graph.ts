import { Annotation, MessagesAnnotation, StateGraph, START, END } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
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

// --- Node Factory ---

const createNodes = (model: BaseChatModel) => ({
  extractStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const agent = createExtractAgent(model);
    const result = await agent.invoke({ input: state.input });
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);

    return {
      extracted: parseJson(content, {
        title: state.input.slice(0, 50),
        type: 'functional',
        priority: 'P2',
        description: state.input,
        isComplete: false,
        missingFields: ['详细描述'],
      }),
      messages: [result],
    };
  },

  clarifyStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const agent = createClarifyAgent(model);
    const result = await agent.invoke({
      input: state.input,
      extractResult: JSON.stringify(state.extracted),
    });
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);

    return {
      clarified: parseJson(content, { needsClarification: false, questions: [] }),
      messages: [result],
    };
  },

  analysisStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const agent = createAnalysisAgent(model);
    const result = await agent.invoke({
      input: state.input,
      extractResult: JSON.stringify(state.extracted),
    });
    const content = typeof result.content === 'string' ? result.content : '';

    return {
      analysisResult: content,
      messages: [result],
    };
  },

  riskStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const agent = createRiskAgent(model);
    const result = await agent.invoke({
      input: state.input,
      extractResult: JSON.stringify(state.extracted),
    });
    const content = typeof result.content === 'string' ? result.content : '';

    return {
      riskResult: content,
      messages: [result],
    };
  },

  summaryStep: async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const agent = createSummaryAgent(model);
    const result = await agent.invoke({
      input: state.input,
      extractResult: JSON.stringify(state.extracted),
      analysisResult: state.analysisResult,
      riskResult: state.riskResult,
      retrievedContext: state.retrievedContext || '无相关参考文档',
    });
    const content = typeof result.content === 'string' ? result.content : '';

    return {
      summary: content,
      messages: [result],
    };
  },
});

// --- Graph Factory ---

export function createAnalysisGraph(model: BaseChatModel) {
  const nodes = createNodes(model);

  return new StateGraph(RequirementAnalysisState)
    .addNode('extractStep', nodes.extractStep)
    .addNode('clarifyStep', nodes.clarifyStep)
    .addNode('analysisStep', nodes.analysisStep)
    .addNode('riskStep', nodes.riskStep)
    .addNode('summaryStep', nodes.summaryStep)
    .addEdge(START, 'extractStep')
    .addEdge('extractStep', 'clarifyStep')
    .addEdge('clarifyStep', 'analysisStep')
    .addEdge('analysisStep', 'riskStep')
    .addEdge('riskStep', 'summaryStep')
    .addEdge('summaryStep', END)
    .compile();
}

// --- Runner ---

export async function runAnalysisGraph(args: {
  input: string;
  retrievedContext: string;
  model: BaseChatModel;
}) {
  const graph = createAnalysisGraph(args.model);
  const result = await graph.invoke({
    input: args.input,
    retrievedContext: args.retrievedContext,
    messages: [],
  });

  return {
    summary: result.summary ?? '',
    extracted: result.extracted ?? {},
    clarified: result.clarified ?? { needsClarification: false, questions: [] },
    analysisResult: result.analysisResult ?? '',
    riskResult: result.riskResult ?? '',
    steps: {
      extract: JSON.stringify(result.extracted ?? {}),
      clarify: JSON.stringify(result.clarified ?? {}),
      analysis: result.analysisResult ?? '',
      risk: result.riskResult ?? '',
      summary: result.summary ?? '',
    },
  };
}
