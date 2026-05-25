import { Injectable } from '@nestjs/common';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';

@Injectable()
export class EmbeddingService {
  private readonly embeddings: HuggingFaceTransformersEmbeddings;

  constructor() {
    this.embeddings = new HuggingFaceTransformersEmbeddings({
      model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    });
  }

  async embedQuery(text: string): Promise<number[]> {
    return await this.embeddings.embedQuery(text);
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return await this.embeddings.embedDocuments(documents);
  }
}