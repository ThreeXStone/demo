import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { OrchestratorService } from '../agents/orchestrator.service';
import { createChatModel, createChatModelFromDbConfig } from '../model.factory';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelConfigService } from '../../model-config/model-config.service';

function formatSSE(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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
    private readonly orchestrator: OrchestratorService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  private async getSystemMetadata(
    conversationId: string,
    type: string,
    analyzeSessionId?: string,
  ): Promise<Record<string, unknown> | null> {
    if (!conversationId) return null;
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
      await this.prisma.message.update({
        where: { id: targetId },
        data: { metadata: metadata as any },
      });
    } else {
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
    @Body() body: {
      sessionId: string;
      input: string;
      model?: string;
      modelConfigId?: string;
      conversationId?: string;
    },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      let llm;
      const modelName = body.model || this.config.get('LLM_MODEL') || 'deepseek-v4-pro';
      if (body.modelConfigId) {
        const dbConfig = await this.modelConfigService.findById(body.modelConfigId);
        llm = createChatModelFromDbConfig(dbConfig);
      } else {
        llm = createChatModel({
          modelName,
          temperature: 0.3,
          apiKey: this.config.get('OPENAI_API_KEY'),
          baseUrl: this.config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1',
        });
      }
      const history = await this.getHistory(body.conversationId);
      console.log(`[UIChat] chat request | session=${body.sessionId} | model=${modelName} | input="${body.input.slice(0, 80)}"`);
      console.log('[UIChat] route: intent=chat → chatHandler');
      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      const stream = await llm.stream([
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
    @Body() body: {
      sessionId: string;
      input: string;
      model?: string;
      modelConfigId?: string;
      conversationId?: string;
    },
    @Req() req: any,
    @Res() res: any,
  ) {
    setupSSE(res);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      let llm;
      const modelName = body.model || this.config.get('LLM_MODEL') || 'deepseek-v4-pro';
      if (body.modelConfigId) {
        const dbConfig = await this.modelConfigService.findById(body.modelConfigId);
        llm = createChatModelFromDbConfig(dbConfig);
      } else {
        llm = createChatModel({
          modelName,
          temperature: 0.3,
          apiKey: this.config.get('OPENAI_API_KEY'),
          baseUrl: this.config.get('OPENAI_BASE_URL') || 'https://api.deepseek.com/v1',
        });
      }
      const history = await this.getHistory(body.conversationId);
      console.log(`[UIChat] query request | session=${body.sessionId} | model=${modelName} | input="${body.input.slice(0, 80)}"`);
      console.log('[UIChat] route: intent=query → queryHandler');
      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      const stream = await llm.stream([
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

  // ====== LangGraph Analysis (使用 OrchestratorService) ======

  @Post('analyze')
  async analyze(
    @Body() body: {
      sessionId: string;
      input: string;
      retrievedContext?: string;
      model?: string;
      modelConfigId?: string;
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
      const convId = body.conversationId;
      const analyzeSid = body.analyzeSessionId;
      const modelName = body.model;
      const modelConfigId = body.modelConfigId;
      // analyze request received

      const history = await this.getHistory(convId);

      heartbeat = setInterval(() => writeSSE(res, ': ping\n\n'), 10_000);

      // ---- 使用 OrchestratorService 流式执行 ----
      // checkpoint 模式下，中间状态（extracted, clarifyPlan）由 MemorySaver 自动管理，
      // 不再从 DB 手动读写。analyzeSessionId 即为 checkpoint 的 thread_id。

      // Critic-Refine summary 子图 streamFinalNode 的回调——直接写 SSE 推送摘要 token
      let summaryStreamStarted = false;
      const tokenWriter = (chunk: string) => {
        if (res.destroyed || res.writableEnded) return;
        try {
          if (!summaryStreamStarted) {
            summaryStreamStarted = true;
            writeSSE(res, formatSSE({
              messageType: 'progress',
              timestamp: new Date().toISOString(),
              payload: { step: 'summaryAgent', message: '汇总报告输出中...' },
            }));
          }
          writeSSE(res, formatSSE({
            messageType: 'markdown',
            timestamp: new Date().toISOString(),
            payload: { content: chunk, isChunk: true },
          }));
          res.flush?.();
        } catch { /* 连接已断开 */ }
      };

      const stream = this.orchestrator.streamOrchestrate({
        input: body.input,
        retrievedContext: body.retrievedContext || '',
        modelName,
        modelConfigId,
        history,
        threadId: analyzeSid,
        clarifyAnswer: body.clarifyAnswer || null,
        skipClarify: !convId,
        tokenWriter,
      });

      let orchestratorResult: any = null;

      for await (const event of stream) {
        switch (event.type) {
          case 'agent_start':
            writeSSE(res, formatSSE({
              messageType: 'progress',
              timestamp: new Date().toISOString(),
              payload: { step: event.agent, message: `${event.agent} (${event.step}/${event.totalSteps})` },
            }));
            break;

          case 'token':
            writeSSE(res, formatSSE({
              messageType: 'markdown',
              timestamp: new Date().toISOString(),
              payload: { content: event.content, isChunk: true },
            }));
            break;

          case 'log':
            console.log(`[Orchestrator] ${event.level}: ${event.message}`, event.data || '');
            break;

          case 'final':
            orchestratorResult = event.result;
            break;
        }
      }

      if (!orchestratorResult) {
        throw new Error('流式输出未返回最终结果');
      }

      const result = orchestratorResult;

      console.log(`[UIChat] graph result | intent=${result.steps?.classifier || '?'} | needsClarify=${result.needsClarification || false} | summaryLen=${(result.report || '').length}`);

      // --- clarify UI 推送 + DB 持久化（仅前端刷新恢复用，图不再读 DB） ---
      if (result.needsClarification && result.currentQuestion && convId && analyzeSid) {
        // 持久化 clarifyPlan 到 DB（仅供前端刷新时恢复 UI 状态，图通过 checkpoint 管理）
        const planMeta: Record<string, unknown> = {
          type: 'clarify_plan',
          analyzeSessionId: analyzeSid,
          questions: result.questions || [],
          currentQuestionIndex: (result.questions || []).findIndex(
            (q: any) => q.id === result.currentQuestion?.id,
          ),
        };
        await this.upsertSystemMetadata(convId, planMeta);

        // 发送 options UI（无论 options 是否为空都发，空选项时前端展示文本输入）
        // 问题文本由 clarify_question 组件渲染，不再额外发 markdown 消息避免重复
        writeSSE(res, formatSSE({
          messageType: 'ui',
          timestamp: new Date().toISOString(),
          payload: {
            messageId: `clarify-${Date.now()}`,
            components: [{
              type: 'clarify_question',
              questionId: result.currentQuestion.id,
              question: result.currentQuestion.question,
              options: result.currentQuestion.options || [],
              multiSelect: (result.currentQuestion as any).multiSelect || false,
            }],
          },
        }));
      }

      // clarify 完成时更新 DB 中最终 plan（标记 currentQuestionIndex=-1 表示全部完成）
      if (!result.needsClarification && result.questions && result.questions.length > 0 && convId && analyzeSid) {
        const finalPlan: Record<string, unknown> = {
          type: 'clarify_plan',
          analyzeSessionId: analyzeSid,
          questions: result.questions,
          currentQuestionIndex: -1,
        };
        await this.upsertSystemMetadata(convId, finalPlan);
      }

      // 摘要内容已由 streamFinalNode 通过 tokenWriter 逐字推送，此处不再重复

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
