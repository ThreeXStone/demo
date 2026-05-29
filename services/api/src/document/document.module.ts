import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { ChunkService } from './chunk.service';
import { DocumentController } from './document.controller';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [EmbeddingModule],
  providers: [DocumentService, ChunkService],
  controllers: [DocumentController],
  exports: [DocumentService, ChunkService],
})
export class DocumentModule {}
