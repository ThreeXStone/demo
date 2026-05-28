import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  async upload(userId: string, file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `不支持的文件类型: ${file.mimetype}，仅支持 TXT/MD/PDF`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('文件大小不能超过 10MB');
    }

    // multer 默认使用 latin1 解码文件名，需要转为 utf8
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const userDir = path.join(UPLOAD_DIR, userId);
    fs.mkdirSync(userDir, { recursive: true });

    const filename = `${Date.now()}-${originalName}`;
    const filePath = path.join(userDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    return this.prisma.document.create({
      data: {
        userId,
        filename: `${userId}/${filename}`,
        originalName,
        mimeType: file.mimetype,
        size: file.size,
        status: 'pending',
      },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('文档不存在');
    if (doc.userId !== userId) throw new ForbiddenException('无权访问此文档');
    return doc;
  }

  async delete(documentId: string, userId: string) {
    const doc = await this.findById(documentId, userId);
    const filePath = path.join(UPLOAD_DIR, doc.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return this.prisma.document.delete({ where: { id: documentId } });
  }
}
