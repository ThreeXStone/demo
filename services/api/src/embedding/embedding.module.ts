import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  providers: [EmbeddingService, SearchService],
  controllers: [SearchController],
  exports: [EmbeddingService, SearchService],
})
export class EmbeddingModule {}
