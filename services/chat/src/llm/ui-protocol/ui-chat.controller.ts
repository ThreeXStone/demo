import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { UIResponseService } from './ui-response.service';

@Controller('api/ui-chat')
export class UIChatController {
  constructor(private readonly uiResponse: UIResponseService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body('sessionId') sessionId: string,
    @Body('input') input: string,
    @Body('context') context?: string,
  ) {
    return this.uiResponse.generateUIResponse(input, undefined, context);
  }

  @Post('action')
  @HttpCode(HttpStatus.OK)
  async action(
    @Body('sessionId') sessionId: string,
    @Body('action') action: any,
  ) {
    return this.uiResponse.handleAction(action, sessionId);
  }
}
