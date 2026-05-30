import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { runAnalysisGraph } from '../graph/requirement-analysis-graph';
import type { NodeProgressEvent } from '../graph/requirement-analysis-graph';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';

function formatSSE(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function getModel(config: ConfigService, modelName?: string) {
  const model = modelName || config.get('LLM_MODEL') || 'deepseek-v4-pro';
  const isGpt = model.startsWith('gpt');

  return new ChatOpenAI({
    model,
    temperature: 0.3,
    maxTokens: 2048,
    timeout: 100_000,
    apiKey: isGpt
      ? config.get('GPT_API_KEY') || config.get('OPENAI_API_KEY')
      : config.get('OPENAI_API_KEY'),
    configuration: {
      baseURL: isGpt
        ? config.get('GPT_BASE_URL') || config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1'
        : config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1',
      timeout: 100_000,
    },
  });
}

@Controller('api/ui-chat')
export class UIChatController {
  constructor(
    private readonly uiFlow: UIFlowService,
    private readonly config: ConfigService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: { sessionId: string; input: string }) {
    return this.uiFlow.handleInput(body.sessionId, body.input);
  }

  @Post('chat/stream')
  async chatStream(
    @Body() body: { sessionId: string; input: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const steps = [
      { agent: 'analyze', name: '分析意图' },
      { agent: 'reasoning', name: '生成回复' },
      { agent: 'components', name: '组装组件' },
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        res.write(formatSSE({
          messageType: 'progress',
          timestamp: new Date().toISOString(),
          payload: { agent: step.agent, agentDisplayName: step.name, step: i + 1, totalSteps: steps.length, status: 'started' },
        }));
        await new Promise((r) => setTimeout(r, 300));
        res.write(formatSSE({
          messageType: 'progress',
          timestamp: new Date().toISOString(),
          payload: { agent: step.agent, agentDisplayName: step.name, step: i + 1, totalSteps: steps.length, status: 'completed' },
        }));
      }

      const result = this.uiFlow.handleInput(body.sessionId, body.input);

      res.write(formatSSE({
        messageType: 'markdown',
        timestamp: new Date().toISOString(),
        payload: { content: result.message, isChunk: false },
      }));

      if (result.components.length > 0) {
        res.write(formatSSE({
          messageType: 'ui',
          timestamp: new Date().toISOString(),
          payload: { messageId: `msg-${Date.now()}`, components: result.components },
        }));
      }

      res.write(formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      res.write(formatSSE({
        messageType: 'error',
        timestamp: new Date().toISOString(),
        payload: { code: 'STREAM_ERROR', message: (err as Error).message },
      }));
    } finally {
      res.end();
    }
  }

  // ====== LangGraph Analysis SSE ======

  @Post('analyze')
  async analyze(
    @Body() body: { sessionId: string; input: string; retrievedContext?: string; model?: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (type: string, payload: Record<string, unknown>) => {
      res.write(formatSSE({ messageType: type, timestamp: new Date().toISOString(), payload }));
    };

    try {
      const model = getModel(this.config, body.model);
      console.log(`[UIChat] analyze request | session=${body.sessionId} | model=${(model as any).model || 'unknown'} | input="${body.input.slice(0, 80)}"`);

      const totalSteps = 6; // classifier + extract + clarify + analysis + risk + summary
      const nodeOrder = ['classifier', 'extractStep', 'clarifyStep', 'analysisStep', 'riskStep', 'summaryStep'];
      let stepIndex = 0;
      const nodeDurations: Record<string, number> = {};

      // Real node progress from graph
      const onNodeEvent = (e: NodeProgressEvent) => {
        if (e.type === 'node_start') {
          console.log(`[UIChat] → SSE node_start: ${e.node} (${e.displayName})`);
          emit('node_start', {
            agent: e.node,
            agentDisplayName: e.displayName,
            timestamp: Date.now(),
          });
        } else if (e.type === 'node_end') {
          nodeDurations[e.node] = e.duration || 0;
          stepIndex = nodeOrder.indexOf(e.node) + 1 || stepIndex + 1;
          console.log(`[UIChat] → SSE node_end:   ${e.node} (${e.displayName}) | ${((e.duration || 0) / 1000).toFixed(1)}s${e.error ? ' | ERROR: ' + e.error : ''}`);
          emit('progress', {
            agent: e.node,
            agentDisplayName: e.displayName,
            step: stepIndex,
            totalSteps,
            status: 'completed',
          });
          emit('node_end', {
            agent: e.node,
            agentDisplayName: e.displayName,
            duration: `${((e.duration || 0) / 1000).toFixed(1)}s`,
            error: e.error,
            timestamp: Date.now(),
          });
        }
      };

      const result = await runAnalysisGraph({
        input: body.input,
        retrievedContext: body.retrievedContext || '',
        model,
        onNodeEvent,
      });

      console.log(`[UIChat] graph result | intent=${result.intent} | summaryLen=${(result.summary || '').length}`);

      // Send markdown response
      if (result.intent === 'analyze') {
        for (const line of (result.summary || '').split('\n')) {
          res.write(formatSSE({
            messageType: 'markdown',
            timestamp: new Date().toISOString(),
            payload: { content: line + '\n', isChunk: true },
          }));
          await new Promise((r) => setTimeout(r, 10));
        }
      } else {
        const text = result.queryResponse || result.chatResponse || result.summary;
        res.write(formatSSE({
          messageType: 'markdown',
          timestamp: new Date().toISOString(),
          payload: { content: text, isChunk: false },
        }));
      }

      // Resolved nodes for steps UI
      const allNodeNames = ['意图识别', '需求抽取', '需求澄清', '深度分析', '风险评估', '汇总报告'];
      const actualSteps = result.intent === 'analyze' ? 6 : 1;
      const stepUI = allNodeNames.slice(0, actualSteps).map((label) => ({
        label,
        status: 'completed' as const,
      }));
      res.write(formatSSE({
        messageType: 'ui',
        timestamp: new Date().toISOString(),
        payload: {
          messageId: `msg-${Date.now()}`,
          components: [{ type: 'steps', steps: stepUI }],
        },
      }));

      res.write(formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      res.write(formatSSE({
        messageType: 'error',
        timestamp: new Date().toISOString(),
        payload: { code: 'GRAPH_ERROR', message: (err as Error).message },
      }));
    } finally {
      res.end();
    }
  }

  @Post('action')
  @HttpCode(HttpStatus.OK)
  async action(
    @Body() body: {
      sessionId: string;
      action: { componentType?: string; payload?: Record<string, unknown> };
    },
  ) {
    return this.uiFlow.handleAction(body.sessionId, body.action);
  }
}
