import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { MessageService } from './message.service';

export class DbChatMessageHistory extends BaseChatMessageHistory {
  lc_namespace = ['langchain', 'stores', 'message', 'db'];

  private _conversationId: string;
  private _messageService: MessageService;

  constructor(conversationId: string, messageService: MessageService) {
    super();
    this._conversationId = conversationId;
    this._messageService = messageService;
  }

  get conversationId(): string {
    return this._conversationId;
  }

  async getMessages(): Promise<BaseMessage[]> {
    return this._messageService.getHistoryAsLangChainMessages(this._conversationId);
  }

  async addMessage(message: BaseMessage): Promise<void> {
    const role = this._roleFromMessage(message);
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
    await this._messageService.addMessage(this._conversationId, role, content);
  }

  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanMessage(message));
  }

  async addAIMessage(message: string): Promise<void> {
    await this.addMessage(new AIMessage(message));
  }

  async clear(): Promise<void> {
    // Not deleting messages on clear — use conversation delete instead
  }

  private _roleFromMessage(message: BaseMessage): string {
    if (message instanceof HumanMessage) return 'human';
    if (message instanceof AIMessage) return 'ai';
    if (message instanceof SystemMessage) return 'system';
    return 'human';
  }
}
