import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunnableLambda, type RunnableConfig } from '@langchain/core/runnables';
import { createChatModel } from '../model.factory';
import {
  runAnalysisGraph,
  streamAnalysisGraph,
} from '../graph/requirement-analysis-graph';
import type { RunAnalysisGraphOutput } from '../graph/requirement-analysis-graph';
import type { OrchestratorStreamEvent, OrchestratorResult } from '../ui-protocol/ui-types';
import type { UIContext } from '../../conversation/ui-action.parser';

/** 图节点名 → Agent 名映射 */
const NODE_TO_AGENT: Record<string, string> = {
  classifier: 'classifierAgent',
  extractStep: 'extractAgent',
  clarifyStep: 'clarifyAgent',
  analysisStep: 'analysisAgent',
  riskStep: 'riskAgent',
  summaryStep: 'summaryAgent',
  queryHandler: 'queryAgent',
  chatHandler: 'chatAgent',
};

/** Agent 执行顺序 */
const AGENT_ORDER = [
  'classifierAgent', 'extractAgent', 'clarifyAgent',
  'analysisAgent', 'riskAgent', 'summaryAgent',
];

@Injectable()
export class OrchestratorService {
  constructor(private readonly config: ConfigService) {}

  /**
   * 同步执行需求分析。
   */
  async orchestrate(args: {
    input: string;
    retrievedContext: string;
    modelName?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    preExtracted?: Record<string, unknown> | null;
    clarifyPlan?: Record<string, unknown> | null;
    clarifyAnswer?: { questionId: string; answer: string; source: string } | null;
    skipClarify?: boolean;
  }): Promise<OrchestratorResult> {
    const model = this.buildModel(args.modelName);

    try {
      const result: RunAnalysisGraphOutput = await runAnalysisGraph({
        input: args.input,
        retrievedContext: args.retrievedContext,
        model,
        history: args.history,
        preExtracted: args.preExtracted,
        clarifyPlan: args.clarifyPlan,
        clarifyAnswer: args.clarifyAnswer,
        skipClarify: args.skipClarify,
      });

      return this.buildResult(result);
    } catch (err) {
      console.error('[OrchestratorService] 执行失败:', err);
      return {
        responseType: 'markdown',
        mode: 'fixed',
        usedAgents: [],
        steps: {},
        report: '## 分析失败\n\n系统内部错误，请稍后重试。',
      };
    }
  }

  /**
   * 流式执行需求分析。返回 AsyncGenerator，逐事件 yield。
   */
  async *streamOrchestrate(args: {
    input: string;
    retrievedContext: string;
    modelName?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    preExtracted?: Record<string, unknown> | null;
    clarifyPlan?: Record<string, unknown> | null;
    clarifyAnswer?: { questionId: string; answer: string; source: string } | null;
    skipClarify?: boolean;
    uiContext?: UIContext;
  }): AsyncGenerator<OrchestratorStreamEvent> {
    const usedAgents: string[] = [];
    const steps: Record<string, string> = {};
    let currentStep = 0;

    try {
      // UI 上下文 → 回退到同步执行
      if (args.uiContext?.uiStage && args.uiContext?.userAction) {
        const result = await this.orchestrate(args);
        yield { type: 'final', result };
        return;
      }

      const model = this.buildModel(args.modelName);

      yield {
        type: 'log',
        level: 'info',
        message: 'streamOrchestrate 准备执行 graph',
        data: { input: args.input.substring(0, 100) },
      };

      const graphStream = streamAnalysisGraph({
        input: args.input,
        retrievedContext: args.retrievedContext,
        model,
        history: args.history,
        preExtracted: args.preExtracted,
        clarifyPlan: args.clarifyPlan,
        clarifyAnswer: args.clarifyAnswer,
        skipClarify: args.skipClarify,
      });

      for await (const event of graphStream) {
        switch (event.type) {
          case 'node_start': {
            const agentName = NODE_TO_AGENT[event.node] || event.node;
            const agentIndex = AGENT_ORDER.indexOf(agentName);
            currentStep = agentIndex >= 0 ? agentIndex + 1 : currentStep + 1;
            usedAgents.push(agentName);
            yield {
              type: 'agent_start',
              agent: agentName,
              step: currentStep,
              totalSteps: AGENT_ORDER.length,
            };
            break;
          }

          case 'token':
            yield {
              type: 'token',
              content: event.content,
              agent: NODE_TO_AGENT[event.node] || event.node,
            };
            break;

          case 'node_end': {
            const endAgentName = NODE_TO_AGENT[event.node] || event.node;
            const endAgentIndex = AGENT_ORDER.indexOf(endAgentName);
            const endStep = endAgentIndex >= 0 ? endAgentIndex + 1 : currentStep;
            yield {
              type: 'agent_end',
              agent: endAgentName,
              step: endStep,
            };
            break;
          }

          case 'log':
            yield {
              type: 'log',
              level: event.level,
              message: event.message,
              data: event.data,
            };
            break;

          case 'complete': {
            const graphResult = event.result;
            Object.assign(steps, graphResult.steps);

            const result = this.buildResult(graphResult);
            // 确保 usedAgents 反映实际执行的节点
            if (result.usedAgents.length === 0) {
              result.usedAgents.push(...usedAgents);
            }
            yield { type: 'final', result };
            break;
          }
        }
      }
    } catch (err) {
      console.error('[streamOrchestrate] 执行失败:', err);
      yield {
        type: 'log',
        level: 'error',
        message: 'streamOrchestrate 执行失败',
        data: { error: err instanceof Error ? err.message : String(err) },
      };
      yield {
        type: 'final',
        result: {
          responseType: 'markdown',
          mode: 'fixed',
          usedAgents,
          steps,
          report: '## 分析失败\n\n系统内部错误，请稍后重试。',
        },
      };
    }
  }

  /**
   * 包装为 LangChain Runnable，供 RunnableWithMessageHistory 调用。
   */
  asRunnable() {
    return new RunnableLambda({
      func: async (
        input: { input: string; modelName?: string },
        config?: RunnableConfig,
      ) => {
        const modelName = (config as any)?.configurable?.modelName as string | undefined;
        const retrievedContext =
          (config as any)?.configurable?.retrievedContext ?? '无相关参考文档';
        return this.orchestrate({
          input: input.input,
          retrievedContext,
          modelName,
        });
      },
    });
  }

  // ---- private ----

  private buildModel(modelName?: string) {
    const model = modelName || this.config.get('LLM_MODEL') || 'deepseek-v4-pro';
    const isGpt = model.startsWith('gpt');
    const apiKey = isGpt
      ? this.config.get('GPT_API_KEY') || this.config.get('OPENAI_API_KEY')
      : this.config.get('OPENAI_API_KEY');
    const baseUrl = isGpt
      ? this.config.get('GPT_BASE_URL') || this.config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1'
      : this.config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1';

    return createChatModel({ modelName: model, apiKey, baseUrl });
  }

  private buildResult(graphResult: RunAnalysisGraphOutput): OrchestratorResult {
    const intent = graphResult.intent || 'analyze';

    if (intent === 'analyze') {
      const needsClarify = graphResult.needsClarification === true;

      if (needsClarify) {
        return {
          responseType: 'markdown',
          mode: 'fixed',
          usedAgents: ['extractAgent', 'clarifyAgent'],
          steps: graphResult.steps,
          report: graphResult.summary,
          thinking: '分析过程：需求提取 → 澄清判断 → 等待用户反馈',
          needsClarification: true,
          currentQuestion: graphResult.currentQuestion,
          questions: graphResult.questions,
          retryHint: graphResult.retryHint,
          extracted: graphResult.extracted,
        };
      }

      return {
        responseType: 'markdown',
        mode: 'fixed',
        usedAgents: ['extractAgent', 'clarifyAgent', 'analysisAgent', 'riskAgent', 'summaryAgent'],
        steps: graphResult.steps,
        report: graphResult.summary,
        thinking: '分析过程：需求提取 → 澄清判断 → 多维度分析 → 风险评估 → 综合报告',
        needsClarification: false,
        questions: graphResult.questions,
        extracted: graphResult.extracted,
        clarifiedData: graphResult.clarifiedData,
      };
    }

    if (intent === 'query') {
      return {
        responseType: 'markdown',
        mode: 'fixed',
        usedAgents: ['classifierAgent', 'queryAgent'],
        steps: graphResult.steps,
        report: graphResult.summary,
        thinking: '意图分类 → 查询需求状态',
      };
    }

    // chat
    return {
      responseType: 'markdown',
      mode: 'fixed',
      usedAgents: ['classifierAgent', 'chatAgent'],
      steps: graphResult.steps,
      report: graphResult.summary,
      thinking: '意图分类 → 直接对话',
    };
  }
}
