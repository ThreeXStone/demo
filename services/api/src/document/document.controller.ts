import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { DocumentService } from './document.service';
import { ChunkService } from './chunk.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { NotificationService } from '../notification/notification.service';

@Controller('api/documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly chunkService: ChunkService,
    private readonly embeddingService: EmbeddingService,
    private readonly notifications: NotificationService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    const doc = await this.documentService.upload(req.user.userId, file);
    this.notifications.emit({
      userId: req.user.userId,
      type: 'upload',
      message: `文件上传成功: ${doc.originalName}`,
      details: { documentId: doc.id, fileName: doc.originalName, size: doc.size },
    });
    return doc;
  }

  @Get()
  async list(@Request() req: any) {
    return this.documentService.findByUser(req.user.userId);
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Request() req: any) {
    return this.documentService.findById(id, req.user.userId);
  }

  @Post(':id/process')
  async process(@Param('id') id: string, @Request() req: any) {
    const doc = await this.documentService.findById(id, req.user.userId);
    const userId = req.user.userId;

    this.notifications.emit({
      userId,
      type: 'process',
      message: `开始处理: ${doc.originalName}`,
      details: { documentId: id },
    });

    try {
      const { chunkCount } = await this.chunkService.chunkDocument(id);
      this.notifications.emit({
        userId,
        type: 'process',
        message: `分块完成: ${chunkCount} 个文本块`,
        details: { documentId: id, chunkCount },
      });

      this.notifications.emit({
        userId,
        type: 'embed',
        message: `正在向量化 ${chunkCount} 个文本块...`,
        details: { documentId: id, chunkCount },
      });

      const { embedded } = await this.embeddingService.embedChunks(id);

      this.notifications.emit({
        userId,
        type: 'complete',
        message: `处理完成: ${doc.originalName}，共 ${embedded} 个向量`,
        details: { documentId: id, chunkCount, embedded },
      });

      return { documentId: id, chunkCount, embedded, status: 'completed' };
    } catch (err) {
      this.notifications.emit({
        userId,
        type: 'error',
        message: `处理失败: ${doc.originalName} - ${(err as Error).message}`,
        details: { documentId: id, error: (err as Error).message },
      });
      throw err;
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    await this.documentService.delete(id, req.user.userId);
    return { deleted: true };
  }
}
