import { Module } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { RequirementService } from './requirement.service';
import { OrchestratorService } from '../agents/orchestrator.service';
import { UIChatController } from './ui-chat.controller';
import { ModelConfigModule } from '../../model-config/model-config.module';

@Module({
  imports: [ModelConfigModule],
  providers: [UIFlowService, RequirementService, OrchestratorService],
  controllers: [UIChatController],
  exports: [UIFlowService, RequirementService, OrchestratorService],
})
export class UIProtocolModule {}
