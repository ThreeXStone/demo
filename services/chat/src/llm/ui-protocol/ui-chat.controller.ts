import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { runAnalysisGraph } from '../graph/requirement-analysis-graph';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';

function formatSSE(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function getModel(config: ConfigService) {
  return new ChatOpenAI({
    model: config.get('LLM_MODEL') || 'deepseek-v4-pro',
    temperature: 0.3,
    maxTokens: 2048,
    apiKey: config.get('OPENAI_API_KEY'),
    configuration: config.get('OPENAI_BASE_URL')
      ? { baseURL: config.get('OPENAI_BASE_URL') }
      : undefined,
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
    @Body() body: { sessionId: string; input: string; retrievedContext?: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const graphSteps = [
      { agent: 'classifier', name: '意图识别' },
      { agent: 'extract', name: '需求抽取' },
      { agent: 'clarify', name: '需求澄清' },
      { agent: 'analysis', name: '深度分析' },
      { agent: 'risk', name: '风险评估' },
      { agent: 'summary', name: '汇总报告' },
    ];

    try {
      const model = getModel(this.config);

      // progress: start
      res.write(formatSSE({
        messageType: 'progress',
        timestamp: new Date().toISOString(),
        payload: { agent: 'start', agentDisplayName: '启动分析引擎', step: 0, totalSteps: graphSteps.length, status: 'started' },
      }));

      let currentStep = 0;
      const sendProgress = (agent: string, name: string) => {
        currentStep++;
        res.write(formatSSE({
          messageType: 'progress',
          timestamp: new Date().toISOString(),
          payload: { agent, agentDisplayName: name, step: currentStep, totalSteps: graphSteps.length, status: 'completed' },
        }));
      };

      // Run the full graph
      const result = await runAnalysisGraph({
        input: body.input,
        retrievedContext: body.retrievedContext || '',
        model,
      });

      // Report based on intent
      if (result.intent === 'analyze') {
        sendProgress('extract', '需求抽取');
        sendProgress('clarify', '需求澄清');
        sendProgress('analysis', '深度分析');
        sendProgress('risk', '风险评估');
        sendProgress('summary', '汇总报告');

        // markdown
        for (const line of (result.summary || '').split('\n')) {
          res.write(formatSSE({
            messageType: 'markdown',
            timestamp: new Date().toISOString(),
            payload: { content: line + '\n', isChunk: true },
          }));
          await new Promise((r) => setTimeout(r, 10));
        }
      } else if (result.intent === 'query') {
        sendProgress('classifier', '意图识别');
        res.write(formatSSE({
          messageType: 'markdown',
          timestamp: new Date().toISOString(),
          payload: { content: result.queryResponse || result.summary, isChunk: false },
        }));
      } else {
        sendProgress('classifier', '意图识别');
        res.write(formatSSE({
          messageType: 'markdown',
          timestamp: new Date().toISOString(),
          payload: { content: result.chatResponse || result.summary, isChunk: false },
        }));
      }

      // ui: steps component showing progress
      const stepUI = graphSteps.slice(0, result.intent === 'analyze' ? 6 : 1).map((s) => ({
        label: s.name,
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
