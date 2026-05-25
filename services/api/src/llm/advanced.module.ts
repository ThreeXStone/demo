import { Module } from '@nestjs/common';
import { LlmModule } from './llm.module';
import { AdvancedAnalysisService } from './advanced-analysis.service';
import { AdvancedController } from './advanced.controller';

@Module({
  imports: [LlmModule],
  providers: [AdvancedAnalysisService],
  controllers: [AdvancedController],
  exports: [AdvancedAnalysisService],
})
export class AdvancedModule {}