import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async addMessage(
    conversationId: string,
    role: string,
    content: string,
    metadata?: Record<string, any>,
  ) {
    return this.prisma.message.create({
      data: { conversationId, role, content, metadata: metadata ?? undefined },
    });
  }

  async getHistory(conversationId: string, limit: number = 100) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async getHistoryAsLangChainMessages(conversationId: string): Promise<BaseMessage[]> {
    const rows = await this.getHistory(conversationId);
    return rows.map((row) => {
      switch (row.role) {
        case 'human':
          return new HumanMessage(row.content);
        case 'ai':
          return new AIMessage(row.content);
        case 'system':
          return new SystemMessage(row.content);
        default:
          return new HumanMessage(row.content);
      }
    });
  }
}
