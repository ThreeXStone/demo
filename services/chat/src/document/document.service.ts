import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentService {
  private uploadDir = path.join(process.cwd(), 'uploads');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.uploadDir)) fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  async upload(userId: string, file: Express.Multer.File) {
    const filename = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    return this.prisma.document.create({
      data: {
        userId,
        filename,
        originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        mimeType: file.mimetype,
        size: file.size,
        status: 'pending',
        chunkCount: 0,
      },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, userId: string) {
    return this.prisma.document.findFirst({ where: { id, userId } });
  }

  async delete(id: string, userId: string) {
    const doc = await this.findById(id, userId);
    if (doc) {
      const filePath = path.join(this.uploadDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await this.prisma.documentChunk.deleteMany({ where: { documentId: id } });
      await this.prisma.document.delete({ where: { id } });
    }
  }

  async markCompleted(id: string) {
    return this.prisma.document.update({
      where: { id },
      data: { status: 'completed' },
    });
  }
}
