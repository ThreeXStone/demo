import { Module, Global } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { RequirementService } from './requirement.service';
import { RunnableMemoryService } from './memory/runnable-memory.service';
import { MemoryController } from './memory/runnable-memory.controller';
import { FilesystemService } from './filesystem/filesystem.service';
import { FilesystemController } from './filesystem/filesystem.controller';
import { VectorStoreService } from './embedding/vector-store.service';
import { EmbeddingController } from './embedding/embedding.controller';
import { OrchestratorService } from './agents/orchestrator.service';
import { AgentsController } from './agents/agents.controller';

@Global()
@Module({
  controllers: [LlmController, MemoryController, FilesystemController, EmbeddingController, AgentsController],
  providers: [LlmService, RequirementService, RunnableMemoryService, FilesystemService, VectorStoreService, OrchestratorService],
  exports: [LlmService, RequirementService, RunnableMemoryService, FilesystemService, VectorStoreService, OrchestratorService],
})
export class LlmModule {}