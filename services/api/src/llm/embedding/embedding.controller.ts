import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { VectorStoreService } from './vector-store.service';
import { VectorDocument } from './vector-store.service';

interface StoreRequest {
  documents: VectorDocument[];
}

interface SearchRequest {
  query: string;
  topK?: number;
}

@Controller('api/embedding')
export class EmbeddingController {
  constructor(private readonly vectorStoreService: VectorStoreService) {}

  @Post('store')
  @HttpCode(HttpStatus.OK)
  async store(@Body() body: StoreRequest) {
    await this.vectorStoreService.addDocuments(body.documents);
    return { count: body.documents.length, message: '文档已存入向量库' };
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() body: SearchRequest) {
    const topK = body.topK ?? 5;
    const results = await this.vectorStoreService.similaritySearchWithScore(body.query, topK);
    return { query: body.query, topK, results };
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  stats() {
    return {
      total: this.vectorStoreService.getDocumentCount(),
      documents: this.vectorStoreService.getAllDocuments().map(d => ({
        content: d.content.substring(0, 50) + '...',
        metadata: d.metadata,
      })),
    };
  }
}