import { Injectable } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PrismaService } from '../prisma/prisma.service';
import { parseFile } from './parsers/parser.factory';

@Injectable()
export class ChunkService {
  private splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  constructor(private prisma: PrismaService) {}

  async chunkDocument(documentId: string) {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });

    try {
      const text = await parseFile(doc.filename, doc.mimeType);

      const chunks = await this.splitter.createDocuments([text]);

      await this.prisma.documentChunk.createMany({
        data: chunks.map((chunk, index) => ({
          documentId,
          content: chunk.pageContent,
          chunkIndex: index,
          metadata: chunk.metadata,
        })),
      });

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'completed',
          chunkCount: chunks.length,
        },
      });

      return { chunkCount: chunks.length };
    } catch (error) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });
      throw error;
    }
  }
}
