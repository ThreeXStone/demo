import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';

function formatSSE(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

@Controller('api/ui-chat')
export class UIChatController {
  constructor(private readonly uiFlow: UIFlowService) {}

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
        // send progress
        res.write(formatSSE({
          messageType: 'progress',
          timestamp: new Date().toISOString(),
          payload: { agent: step.agent, agentDisplayName: step.name, step: i + 1, totalSteps: steps.length, status: 'started' },
        }));
        // simulate thinking time
        await new Promise((r) => setTimeout(r, 300));

        res.write(formatSSE({
          messageType: 'progress',
          timestamp: new Date().toISOString(),
          payload: { agent: step.agent, agentDisplayName: step.name, step: i + 1, totalSteps: steps.length, status: 'completed' },
        }));
      }

      // Get the actual response
      const result = this.uiFlow.handleInput(body.sessionId, body.input);

      // Send markdown part
      res.write(formatSSE({
        messageType: 'markdown',
        timestamp: new Date().toISOString(),
        payload: { content: result.message, isChunk: false },
      }));

      // Send UI components
      if (result.components.length > 0) {
        res.write(formatSSE({
          messageType: 'ui',
          timestamp: new Date().toISOString(),
          payload: { messageId: `msg-${Date.now()}`, components: result.components },
        }));
      }

      // Done
      res.write(formatSSE({
        messageType: 'done',
        timestamp: new Date().toISOString(),
        payload: null,
      }));
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
