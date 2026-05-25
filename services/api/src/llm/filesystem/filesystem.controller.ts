import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesystemService } from './filesystem.service';

interface FileChatRequest {
  input: string;
}

@Controller('api/files')
export class FilesystemController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Post('file-chat')
  @HttpCode(HttpStatus.OK)
  async fileChat(@Body() body: FileChatRequest) {
    const result = await this.filesystemService.fileChat(body.input);
    return { input: body.input, result };
  }
}