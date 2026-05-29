import { Module, forwardRef } from '@nestjs/common';
import { LlmModule } from './llm.module';
import { AdvancedAnalysisService } from './advanced-analysis.service';
import { AdvancedController } from './advanced.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [LlmModule, forwardRef(() => ConversationModule), EmbeddingModule],
  providers: [AdvancedAnalysisService],
  controllers: [AdvancedController],
  exports: [AdvancedAnalysisService],
})
export class AdvancedModule {}
