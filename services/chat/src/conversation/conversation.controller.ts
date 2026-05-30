import {
  Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/conversations')
export class ConversationController {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUser(): Promise<string> {
    const user = await this.prisma.user.findFirst({ where: { email: 'default@local' } });
    if (user) return user.id;
    const created = await this.prisma.user.create({
      data: { email: 'default@local', password: 'local-dev' },
    });
    return created.id;
  }

  @Post()
  async create(@Body('title') title?: string) {
    const userId = await this.ensureUser();
    return this.prisma.conversation.create({
      data: { title: title || '新会话', userId },
    });
  }

  @Get()
  async list() {
    const userId = await this.ensureUser();
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id/messages')
  async messages(@Param('id') conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post(':id/messages')
  async addMessage(
    @Param('id') conversationId: string,
    @Body() body: { role: string; content: string },
  ) {
    return this.prisma.message.create({
      data: { conversationId, role: body.role, content: body.content.slice(0, 10000) },
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') conversationId: string) {
    await this.prisma.message.deleteMany({ where: { conversationId } });
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { deleted: true };
  }
}
