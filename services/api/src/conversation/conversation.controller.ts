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
import { DbChatMessageHistory } from './db-chat-history';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ChatOpenAI } from '@langchain/openai';
import {
  RunnableWithMessageHistory,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { trimMessages } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { loadLangChainConfig, getApiKeys } from '../config/load-langchain-config';

interface ChatBody {
  input: string;
}

@Controller('api/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
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

    const model = this.createModel();
    const messageService = this.messageService;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是一个电商客服助手，帮助用户处理订单退货、退款等问题。'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
    ]);

    const trimmer = trimMessages({
      maxTokens: 2000,
      strategy: 'last',
      tokenCounter: model,
      includeSystem: true,
      allowPartial: false,
    });

    const chain = RunnablePassthrough.assign({
      chat_history: async (input: { chat_history: any[] }) => trimmer.invoke(input.chat_history),
    }).pipe(prompt).pipe(model);

    const runnable = new RunnableWithMessageHistory({
      runnable: chain,
      getMessageHistory: async (sessionId: string) => {
        return new DbChatMessageHistory(sessionId, messageService);
      },
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
    });

    const result = await runnable.invoke(
      { input: body.input, chat_history: [] } as any,
      { configurable: { sessionId: conversationId } },
    );

    return { output: result.content };
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

  private createModel(): ChatOpenAI {
    const config = loadLangChainConfig();
    const { openaiApiKey, openaiBaseURL } = getApiKeys();

    const chatConfig: any = {
      model: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      topP: config.llm.topP,
    };

    if (openaiApiKey) chatConfig.apiKey = openaiApiKey;
    if (openaiBaseURL) chatConfig.configuration = { baseURL: openaiBaseURL };

    return new ChatOpenAI(chatConfig);
  }
}
