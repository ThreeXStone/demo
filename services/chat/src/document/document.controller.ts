import {
  Controller, Post, Get, Delete, Param,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';

@Controller('api/documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.documentService.upload('default', file);
  }

  @Get()
  async list() {
    return this.documentService.findByUser('default');
  }

  @Post(':id/process')
  async process(@Param('id') id: string) {
    return this.documentService.markCompleted(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string) {
    await this.documentService.delete(id, 'default');
    return { deleted: true };
  }
}
