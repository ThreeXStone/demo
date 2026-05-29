import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';

@Controller('api/ui-chat')
export class UIChatController {
  constructor(private readonly uiFlow: UIFlowService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: { sessionId: string; input: string }) {
    return this.uiFlow.handleInput(body.sessionId, body.input);
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
