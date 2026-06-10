import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunnableLambda, type RunnableConfig } from '@langchain/core/runnables';
import { createChatModel, createChatModelFromDbConfig, createLightChatModel } from '../model.factory';
import { ModelConfigService } from '../../model-config/model-config.service';
import {
  runAnalysisGraph,
  streamAnalysisGraph,
} from '../graph/requirement-analysis-graph';
import type { RunAnalysisGraphOutput } from '../graph/requirement-analysis-graph';
import type { OrchestratorStreamEvent, OrchestratorResult } from '../ui-protocol/ui-types';
import type { UIContext } from '../../conversation/ui-action.parser';
import { PostgresCheckpointerService } from '../graph/postgres-checkpointer.service';

/** 图节点名 → Agent 名映射 */
const NODE_TO_AGENT: Record<string, string> = {
  triage: 'triageAgent',
  extractStep: 'extractAgent',
  clarifyStep: 'clarifyAgent',
  analysisStep: 'analysisAgent',       // Wraps supervisor + multi-expert internally
  riskStep: 'riskAgent',
  summaryStep: 'summaryAgent',
};

/** Agent 执行顺序 */
const AGENT_ORDER = [
  'triageAgent', 'extractAgent', 'clarifyAgent',
  'analysisAgent', 'riskAgent', 'summaryAgent',
];

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly config: ConfigService,
    private readonly modelConfigService: ModelConfigService,
    private readonly checkpointerService: PostgresCheckpointerService,
  ) {}

  /**
   * 同步执行需求分析。
   */
  async orchestrate(args: {
    input: string;
    retrievedContext: string;
    modelName?: string;
    modelConfigId?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    threadId?: string;
    clarifyAnswer?: { questionId: string; answer: string; source: string } | null;
    skipClarify?: boolean;
  }): Promise<OrchestratorResult> {
    const { strongModel, apiKey, baseUrl } = await this.buildModel(args.modelName, args.modelConfigId);
    const lightModel = this.buildLightModel(apiKey, baseUrl);
    const cp = this.checkpointerService.getCheckpointer();

    try {
      const result: RunAnalysisGraphOutput = await runAnalysisGraph({
        input: args.input,
        retrievedContext: args.retrievedContext,
        lightModel,
        strongModel,
        checkpointer: cp,
        history: args.history,
        threadId: args.threadId,
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
    modelConfigId?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    threadId?: string;
    clarifyAnswer?: { questionId: string; answer: string; source: string } | null;
    skipClarify?: boolean;
    uiContext?: UIContext;
    tokenWriter?: (chunk: string) => void;
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

      const { strongModel, apiKey, baseUrl } = await this.buildModel(args.modelName, args.modelConfigId);
      const lightModel = this.buildLightModel(apiKey, baseUrl);
      const cp = this.checkpointerService.getCheckpointer();

      const graphStream = streamAnalysisGraph({
        input: args.input,
        retrievedContext: args.retrievedContext,
        lightModel,
        strongModel,
        checkpointer: cp,
        history: args.history,
        threadId: args.threadId,
        clarifyAnswer: args.clarifyAnswer,
        skipClarify: args.skipClarify,
        tokenWriter: args.tokenWriter,
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

  private async buildModel(modelName?: string, modelConfigId?: string) {
    // 优先：传入 modelConfigId → 从 DB 加载配置
    if (modelConfigId) {
      const dbConfig = await this.modelConfigService.findById(modelConfigId);
      const strongModel = createChatModelFromDbConfig(dbConfig);
      return { strongModel, apiKey: dbConfig.apiKey ?? undefined, baseUrl: dbConfig.baseUrl ?? undefined };
    }
    // 兜底：现有逻辑（从 ConfigService 读取 .env）
    const model = modelName || this.config.get('LLM_MODEL') || 'deepseek-v4-pro';
    const isGpt = model.startsWith('gpt');
    const apiKey = isGpt
      ? this.config.get('GPT_API_KEY') || this.config.get('OPENAI_API_KEY')
      : this.config.get('OPENAI_API_KEY');
    const baseUrl = isGpt
      ? this.config.get('GPT_BASE_URL') || this.config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1'
      : this.config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1';

    const strongModel = createChatModel({ modelName: model, apiKey, baseUrl });
    return { strongModel, apiKey, baseUrl };
  }

  private buildLightModel(apiKey?: string, baseUrl?: string) {
    return createLightChatModel(apiKey, baseUrl);
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

    // chat（triage 已直接回答，短路结束）
    return {
      responseType: 'markdown',
      mode: 'fixed',
      usedAgents: ['triageAgent'],
      steps: graphResult.steps,
      report: graphResult.summary,
      thinking: '分诊 → 直接回答（短路）',
    };
  }
}
