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

function setupSSE(res: any) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.socket?.setNoDelay?.(true);
}

function writeSSE(res: any, data: string) {
  res.write(data);
  res.flush?.();
}

@Controller('api/ui-chat')
export class UIChatController {
  constructor(
    private readonly uiFlow: UIFlowService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async getHistory(conversationId?: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    if (!conversationId) return [];
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return messages.map((m) => ({
      role: (m.role === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));
  }

  // ====== Simple Chat (no LangGraph) ======

  @Post('chat')
  async chat(
    @Body() body: { sessionId: string; input: string; model?: string; conversationId?: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      const model = getModel(this.config, body.model);
      const history = await this.getHistory(body.conversationId);
      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      const stream = await model.stream([
        { role: 'system', content: '你是友好的AI助手。用自然、亲切的语气回复。' },
        ...history,
        { role: 'user', content: body.input },
      ]);

      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string'
          ? chunk.content
          : Array.isArray(chunk.content) ? chunk.content.map((c: any) => c.text || '').join('') : '';
        if (text) {
          writeSSE(res, formatSSE({
            messageType: 'markdown',
            timestamp: new Date().toISOString(),
            payload: { content: text, isChunk: true },
          }));
        }
      }

      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      writeSSE(res, formatSSE({
        messageType: 'error',
        timestamp: new Date().toISOString(),
        payload: { code: 'CHAT_ERROR', message: (err as Error).message },
      }));
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  // ====== Simple Query (no LangGraph) ======

  @Post('query')
  async query(
    @Body() body: { sessionId: string; input: string; model?: string; conversationId?: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      const model = getModel(this.config, body.model);
      const history = await this.getHistory(body.conversationId);
      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      const stream = await model.stream([
        { role: 'system', content: '你是需求查询助手。简洁回答查询。' },
        ...history,
        { role: 'user', content: body.input },
      ]);

      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string'
          ? chunk.content
          : Array.isArray(chunk.content) ? chunk.content.map((c: any) => c.text || '').join('') : '';
        if (text) {
          writeSSE(res, formatSSE({
            messageType: 'markdown',
            timestamp: new Date().toISOString(),
            payload: { content: text, isChunk: true },
          }));
        }
      }

      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      writeSSE(res, formatSSE({
        messageType: 'error',
        timestamp: new Date().toISOString(),
        payload: { code: 'QUERY_ERROR', message: (err as Error).message },
      }));
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  // ====== UI Protocol Requirement Collection ======

  @Post('requirement/collect')
  async requirementCollect(
    @Body() body: { sessionId: string; input: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);

    try {
      const result = this.uiFlow.handleInput(body.sessionId, body.input);

      writeSSE(res, formatSSE({
        messageType: 'markdown',
        timestamp: new Date().toISOString(),
        payload: { content: result.message, isChunk: false },
      }));

      if (result.components.length > 0) {
        writeSSE(res, formatSSE({
          messageType: 'ui',
          timestamp: new Date().toISOString(),
          payload: { messageId: `msg-${Date.now()}`, components: result.components },
        }));
      }

      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      writeSSE(res, formatSSE({
        messageType: 'error',
        timestamp: new Date().toISOString(),
        payload: { code: 'REQUIREMENT_ERROR', message: (err as Error).message },
      }));
    } finally {
      res.end();
    }
  }

  @Post('requirement/action')
  @HttpCode(HttpStatus.OK)
  async requirementAction(
    @Body() body: {
      sessionId: string;
      action: { componentType?: string; payload?: Record<string, unknown> };
    },
  ) {
    return this.uiFlow.handleAction(body.sessionId, body.action);
  }

  // ====== LangGraph Analysis ======

  @Post('analyze')
  async analyze(
    @Body() body: { sessionId: string; input: string; retrievedContext?: string; model?: string; conversationId?: string },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      const model = getModel(this.config, body.model);
      console.log(`[UIChat] analyze request | session=${body.sessionId} | model=${(model as any).model || 'unknown'} | input="${body.input.slice(0, 80)}"`);

      const history = await this.getHistory(body.conversationId);

      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      const result = await runAnalysisGraph({
        input: body.input,
        retrievedContext: body.retrievedContext || '',
        model,
        history,
        onProgress: (step: string, message: string) => {
          writeSSE(res, formatSSE({
            messageType: 'progress',
            timestamp: new Date().toISOString(),
            payload: { step, message },
          }));
        },
        onToken: (content: string) => {
          writeSSE(res, formatSSE({
            messageType: 'markdown',
            timestamp: new Date().toISOString(),
            payload: { content, isChunk: true },
          }));
        },
      });

      console.log(`[UIChat] graph result | intent=${result.intent} | summaryLen=${(result.summary || '').length}`);
      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      writeSSE(res, formatSSE({
        messageType: 'error',
        timestamp: new Date().toISOString(),
        payload: { code: 'GRAPH_ERROR', message: (err as Error).message },
      }));
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }
}
