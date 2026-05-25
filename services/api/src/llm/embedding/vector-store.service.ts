import { Injectable, OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';

export interface VectorDocument {
  content: string;
  metadata: Record<string, any>;
}

interface StoredDocument {
  content: string;
  metadata: Record<string, any>;
  embedding: number[];
}

const WORKSPACE_ROOT = path.join(process.cwd(), 'workspace');

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly documents: StoredDocument[] = [];

  async onModuleInit() {
    await this.initializeFromWorkspace();
  }

  private async initializeFromWorkspace() {
    const initialFiles = [
      { path: 'policies/return-policy.md', type: 'policy', name: 'return-policy' },
      { path: 'policies/refund-policy.md', type: 'policy', name: 'refund-policy' },
      { path: 'faq/after-sale-faq.md', type: 'faq', name: 'after-sale-faq' },
    ];

    const docs: VectorDocument[] = [];

    for (const file of initialFiles) {
      const fullPath = path.join(WORKSPACE_ROOT, file.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        docs.push({
          content,
          metadata: { type: file.type, name: file.name, source: file.path },
        });
      }
    }

    if (docs.length > 0) {
      await this.addDocuments(docs);
      console.log(`[VectorStore] 初始化灌库完成，共加载 ${docs.length} 个文档`);
    }
  }

  private mockEmbedding(text: string): number[] {
    const embedding: number[] = [];
    for (let i = 0; i < 384; i++) {
      embedding.push((text.charCodeAt(i % text.length) + text.charCodeAt((i + 1) % text.length)) / 1000);
    }
    return embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async addDocuments(docs: VectorDocument[]): Promise<void> {
    for (const doc of docs) {
      this.documents.push({
        content: doc.content,
        metadata: doc.metadata,
        embedding: this.mockEmbedding(doc.content),
      });
    }
  }

  async similaritySearch(query: string, topK: number = 5): Promise<VectorDocument[]> {
    const queryEmbedding = this.mockEmbedding(query);

    const scored = this.documents.map(doc => ({
      content: doc.content,
      metadata: doc.metadata,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(d => ({
      content: d.content,
      metadata: d.metadata,
    }));
  }

  async similaritySearchWithScore(query: string, topK: number = 5) {
    if (!query || typeof query !== 'string') {
      return [];
    }
    const queryEmbedding = this.mockEmbedding(query);

    const scored = this.documents.map(doc => ({
      content: doc.content,
      metadata: doc.metadata,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  getDocumentCount(): number {
    return this.documents.length;
  }

  getAllDocuments(): VectorDocument[] {
    return this.documents.map(doc => ({
      content: doc.content,
      metadata: doc.metadata,
    }));
  }
}