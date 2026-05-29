import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private embedder: any = null;
  private readonly modelName = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

  private async getEmbedder() {
    if (!this.embedder) {
      const { pipeline, mean_pooling } = await import('@xenova/transformers');
      this.embedder = {
        pipeline: await pipeline('feature-extraction', this.modelName, {
          local_files_only: true,
        }),
        mean_pooling,
      };
      this.logger.log(`Model loaded: ${this.modelName}`);
    }
    return this.embedder;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const { pipeline: pipe, mean_pooling } = await this.getEmbedder();
    const cleanTexts = texts.map((t) => t.replace(/\n/g, ' '));

    const rawOutput = (await pipe(cleanTexts)) as any;

    const tokenizer = pipe.tokenizer;
    const inputs = tokenizer(cleanTexts, { padding: true, truncation: true });
    const pooled = mean_pooling(rawOutput, inputs.attention_mask);
    const normalized = pooled.normalize(2, -1);

    return normalized.tolist();
  }

  constructor(private readonly prisma: PrismaService) {}

  async embedChunks(documentId: string) {
    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      return { embedded: 0 };
    }

    const texts = chunks.map((c) => c.content);
    const vectors = await this.embedTexts(texts);

    for (let i = 0; i < chunks.length; i++) {
      const vectorLiteral = `[${vectors[i].join(',')}]`;
      await this.prisma.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = '${vectorLiteral}'::vector WHERE id = $1`,
        chunks[i].id,
      );
    }

    return { embedded: chunks.length };
  }
}
