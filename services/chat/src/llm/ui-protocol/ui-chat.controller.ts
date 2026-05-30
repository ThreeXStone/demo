import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { runAnalysisGraph } from '../graph/requirement-analysis-graph';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

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
    private readonly prisma: PrismaService,
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

    try {
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
    @Body() body: { sessionId: string; input: string; retrievedContext?: string; model?: string; conversationId?: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const model = getModel(this.config, body.model);
      console.log(`[UIChat] analyze request | session=${body.sessionId} | model=${(model as any).model || 'unknown'} | input="${body.input.slice(0, 80)}"`);

      // Retrieve conversation history
      let history: { role: 'user' | 'assistant'; content: string }[] = [];
      if (body.conversationId) {
        const messages = await this.prisma.message.findMany({
          where: { conversationId: body.conversationId },
          orderBy: { createdAt: 'asc' },
          take: 20,
        });
        history = messages.map((m) => ({
          role: (m.role === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        }));
      }

      const result = await runAnalysisGraph({
        input: body.input,
        retrievedContext: body.retrievedContext || '',
        model,
        history,
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
