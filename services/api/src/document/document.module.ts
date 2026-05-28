import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { ChunkService } from './chunk.service';
import { DocumentController } from './document.controller';

@Module({
  providers: [DocumentService, ChunkService],
  controllers: [DocumentController],
  exports: [DocumentService, ChunkService],
})
export class DocumentModule {}
