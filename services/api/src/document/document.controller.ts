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

@Controller('api/documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly chunkService: ChunkService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.documentService.upload(req.user.userId, file);
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
  async process(@Param('id') id: string) {
    return this.chunkService.chunkDocument(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    await this.documentService.delete(id, req.user.userId);
    return { deleted: true };
  }
}
