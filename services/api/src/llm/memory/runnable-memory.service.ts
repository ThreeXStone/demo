import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
  RunnableWithMessageHistory,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import {
  InMemoryChatMessageHistory,
} from '@langchain/core/chat_history';
import {
  trimMessages,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { loadLangChainConfig, getApiKeys } from '../../config/load-langchain-config';

export interface ChatMessage {
  role: 'human' | 'ai';
  content: string;
  timestamp: number;
}

@Injectable()
export class RunnableMemoryService {
  private readonly sessions = new Map<string, InMemoryChatMessageHistory>();
  private readonly maxTokens = 2000;
  private readonly model: ChatOpenAI;
  private readonly runnable: RunnableWithMessageHistory<any, any>;

  constructor() {
    this.model = this.createModel();

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是一个电商客服助手，帮助用户处理订单退货、退款等问题。'],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
    ]);

    const trimmer = trimMessages({
      maxTokens: this.maxTokens,
      strategy: 'last',
      tokenCounter: this.model,
      includeSystem: true,
      allowPartial: false,
    });

    const chain = RunnablePassthrough.assign({
      chat_history: async (input: { chat_history: any[] }) => trimmer.invoke(input.chat_history),
    }).pipe(prompt).pipe(this.model);

    this.runnable = new RunnableWithMessageHistory({
      runnable: chain,
      getMessageHistory: async (sessionId: string) => {
        if (!this.sessions.has(sessionId)) {
          this.sessions.set(sessionId, new InMemoryChatMessageHistory());
        }
        return this.sessions.get(sessionId)!;
      },
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
    });
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

    if (openaiApiKey) {
      chatConfig.apiKey = openaiApiKey;
    }

    if (openaiBaseURL) {
      chatConfig.configuration = { baseURL: openaiBaseURL };
    }

    return new ChatOpenAI(chatConfig);
  }

  async chat(sessionId: string, input: string): Promise<string> {
    const result = await this.runnable.invoke(
      { input },
      { configurable: { sessionId } }
    );

    return result.content as string;
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const historyStore = this.sessions.get(sessionId);
    if (!historyStore) return [];

    const messages = await historyStore.getMessages();
    return messages.map((msg: any) => ({
      role: msg instanceof AIMessage ? 'ai' : 'human',
      content: msg.content,
      timestamp: Date.now(),
    }));
  }

  async appendMessage(sessionId: string, human: string, ai: string): Promise<void> {
    const historyStore = this.sessions.get(sessionId);
    if (!historyStore) {
      this.sessions.set(sessionId, new InMemoryChatMessageHistory());
    }
    const store = this.sessions.get(sessionId)!;
    await store.addMessage(new HumanMessage(human));
    await store.addMessage(new AIMessage(ai));
  }

  async clearSession(sessionId: string): Promise<void> {
    const historyStore = this.sessions.get(sessionId);
    if (historyStore) {
      await historyStore.clear();
    }
  }
}