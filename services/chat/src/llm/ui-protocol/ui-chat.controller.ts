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

@Controller('chat/ui-chat')
export class UIChatController {
  constructor(
    private readonly uiFlow: UIFlowService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async getSystemMetadata(conversationId: string, type: string, analyzeSessionId?: string): Promise<Record<string, unknown> | null> {
    if (!conversationId) return null;
    // Prisma Json path query: find messages where metadata->>'type' = type
    // Use JSONB containment if supported, otherwise filter in app
    const messages = await this.prisma.message.findMany({
      where: { conversationId, role: 'system' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    for (const m of messages) {
      const meta = m.metadata as Record<string, unknown> | null;
      if (meta?.type === type) {
        if (analyzeSessionId && meta.analyzeSessionId !== analyzeSessionId) continue;
        return meta;
      }
    }
    return null;
  }

  private async upsertSystemMetadata(
    conversationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!conversationId) return;
    const type = metadata.type as string;
    const analyzeSessionId = metadata.analyzeSessionId as string;
    // 找已存在的记录
    const existing = await this.prisma.message.findFirst({
      where: { conversationId, role: 'system' },
      orderBy: { createdAt: 'desc' },
    });
    // 检查是否已有同 type + analyzeSessionId 的记录
    const allSystem = await this.prisma.message.findMany({
      where: { conversationId, role: 'system' },
    });
    let targetId: string | null = null;
    for (const m of allSystem) {
      const meta = m.metadata as Record<string, unknown> | null;
      if (meta?.type === type && (analyzeSessionId ? meta?.analyzeSessionId === analyzeSessionId : true)) {
        targetId = m.id;
        break;
      }
    }
    if (targetId) {
      // update in place
      await this.prisma.message.update({
        where: { id: targetId },
        data: { metadata: metadata as any },
      });
    } else {
      // insert new
      await this.prisma.message.create({
        data: {
          conversationId,
          role: 'system',
          content: `[${type}]`,
          metadata: metadata as any,
        },
      });
    }
  }

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
      console.log(`[UIChat] chat request | session=${body.sessionId} | model=${(model as any).model || 'unknown'} | input="${body.input.slice(0, 80)}"`);
      console.log('[UIChat] route: intent=chat → chatHandler');
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

      console.log(`[UIChat] chat done | session=${body.sessionId}`);
      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      console.log(`[UIChat] chat error | session=${body.sessionId} | ${(err as Error).message}`);
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
      console.log(`[UIChat] query request | session=${body.sessionId} | model=${(model as any).model || 'unknown'} | input="${body.input.slice(0, 80)}"`);
      console.log('[UIChat] route: intent=query → queryHandler');
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

      console.log(`[UIChat] query done | session=${body.sessionId}`);
      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      console.log(`[UIChat] query error | session=${body.sessionId} | ${(err as Error).message}`);
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
    @Body() body: {
      sessionId: string;
      input: string;
      retrievedContext?: string;
      model?: string;
      conversationId?: string;
      analyzeSessionId?: string;
      clarifyAnswer?: { questionId: string; answer: string; source: string };
    },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      const model = getModel(this.config, body.model);
      const convId = body.conversationId;
      const analyzeSid = body.analyzeSessionId;
      console.log(`[UIChat] analyze request | session=${body.sessionId} | model=${(model as any).model || 'unknown'} | convId=${convId || 'none'} | analyzeSid=${analyzeSid || 'none'} | input="${body.input.slice(0, 80)}" | clarify=${body.clarifyAnswer ? 'yes' : 'no'}`);

      const history = await this.getHistory(convId);

      // 从 DB 读取已缓存的 extracted 和 clarifyPlan
      const preExtracted = convId
        ? await this.getSystemMetadata(convId, 'extracted', analyzeSid)
        : null;
      const clarifyPlanMeta = convId
        ? await this.getSystemMetadata(convId, 'clarify_plan', analyzeSid)
        : null;

      // 用 clarifyPlan 包裹 currentQuestionIndex
      const clarifyPlanInput = clarifyPlanMeta
        ? { ...clarifyPlanMeta, currentQuestionIndex: clarifyPlanMeta.currentQuestionIndex ?? 0 }
        : null;

      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      const result = await runAnalysisGraph({
        input: body.input,
        retrievedContext: body.retrievedContext || '',
        model,
        history,
        preExtracted: preExtracted as Record<string, unknown> | null,
        clarifyPlan: clarifyPlanInput as Record<string, unknown> | null,
        clarifyAnswer: body.clarifyAnswer || null,
        skipClarify: !convId,
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

      console.log(`[UIChat] graph result | intent=${result.intent} | needsClarify=${result.needsClarification || false} | summaryLen=${(result.summary || '').length}`);

      // 需要澄清 → 写 DB + 发送 UI 消息
      if (result.needsClarification && result.currentQuestion && convId && analyzeSid) {
        // 持久化 extracted（首轮）
        if (result.extracted && Object.keys(result.extracted).length > 0) {
          await this.upsertSystemMetadata(convId, {
            type: 'extracted',
            analyzeSessionId: analyzeSid,
            data: result.extracted,
          });
        }
        // 持久化 clarifyPlan
        const planMeta: Record<string, unknown> = {
          type: 'clarify_plan',
          analyzeSessionId: analyzeSid,
          questions: result.questions || [],
          currentQuestionIndex: (result.questions || []).findIndex(
            (q) => q.id === result.currentQuestion?.id,
          ),
        };
        await this.upsertSystemMetadata(convId, planMeta);

        // 发送问题文本
        const hintText = result.retryHint ? `\n\n> ${result.retryHint}` : '';
        writeSSE(res, formatSSE({
          messageType: 'markdown',
          timestamp: new Date().toISOString(),
          payload: { content: `**${result.currentQuestion.question}**${hintText}`, isChunk: false },
        }));

        // 发送 options UI（如果有）
        if (result.currentQuestion.options.length > 0) {
          writeSSE(res, formatSSE({
            messageType: 'ui',
            timestamp: new Date().toISOString(),
            payload: {
              messageId: `clarify-${Date.now()}`,
              components: [{
                type: 'clarify_question',
                questionId: result.currentQuestion.id,
                question: result.currentQuestion.question,
                options: result.currentQuestion.options,
              }],
            },
          }));
        }
      }

      writeSSE(res, formatSSE({ messageType: 'done', timestamp: new Date().toISOString(), payload: null }));
    } catch (err) {
      console.log(`[UIChat] analyze error | session=${body.sessionId} | ${(err as Error).message}`);
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
