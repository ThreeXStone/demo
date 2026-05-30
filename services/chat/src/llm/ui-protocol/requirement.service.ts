import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RequirementService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    sessionId: string;
    reqId: string;
    title: string;
    type: string;
    priority: string;
    description: string;
    acceptanceCriteria?: string;
    notes?: string;
  }) {
    return this.prisma.requirement.create({ data });
  }

  async findBySession(sessionId: string) {
    return this.prisma.requirement.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.requirement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByReqId(reqId: string) {
    return this.prisma.requirement.findFirst({ where: { reqId } });
  }
}
