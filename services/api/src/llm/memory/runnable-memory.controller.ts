import { Controller, Post, Get, Delete, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RunnableMemoryService } from './runnable-memory.service';

interface ChatRequest {
  sessionId: string;
  input: string;
}

interface ClearRequest {
  sessionId: string;
}

@Controller('api/memory')
export class MemoryController {
  constructor(private readonly memoryService: RunnableMemoryService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: ChatRequest) {
    console.log('[Memory] chat called:', body);
    try {
      const output = await this.memoryService.chat(body.sessionId, body.input);
      console.log('[Memory] chat result:', output);
      return { sessionId: body.sessionId, output };
    } catch (error) {
      console.error('[Memory] chat error:', error);
      throw error;
    }
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  async history(@Query('sessionId') sessionId: string) {
    const history = await this.memoryService.getHistory(sessionId);
    return { sessionId, history };
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  async clear(@Query('sessionId') sessionId: string) {
    await this.memoryService.clearSession(sessionId);
    return { sessionId, cleared: true };
  }
}