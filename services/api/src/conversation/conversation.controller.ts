import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { MessageService } from './message.service';
import { AdvancedAnalysisService } from '../llm/advanced-analysis.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

interface ChatBody {
  input: string;
}

@Controller('api/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly advancedAnalysis: AdvancedAnalysisService,
  ) {}

  @Post()
  async create(
    @Request() req: any,
    @Body('title') title?: string,
  ) {
    return this.conversationService.create(req.user.userId, title);
  }

  @Get()
  async list(@Request() req: any) {
    return this.conversationService.findByUser(req.user.userId);
  }

  @Get(':id/messages')
  async messages(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    await this.conversationService.findById(conversationId, req.user.userId);
    return this.messageService.getHistory(conversationId, limit ? parseInt(limit, 10) : undefined);
  }

  @Post(':id/chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Body() body: ChatBody,
  ) {
    await this.conversationService.findById(conversationId, req.user.userId);

    const result = await this.advancedAnalysis.analyze(
      req.user.userId,
      conversationId,
      body.input,
    );

    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Request() req: any,
    @Param('id') conversationId: string,
  ) {
    await this.conversationService.delete(conversationId, req.user.userId);
    return { deleted: true };
  }
}
