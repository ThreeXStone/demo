import { Module } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { RequirementService } from './requirement.service';
import { OrchestratorService } from '../agents/orchestrator.service';
import { UIChatController } from './ui-chat.controller';
import { ModelConfigModule } from '../../model-config/model-config.module';
import { PostgresCheckpointerService } from '../graph/postgres-checkpointer.service';

@Module({
  imports: [ModelConfigModule],
  providers: [UIFlowService, RequirementService, OrchestratorService, PostgresCheckpointerService],
  controllers: [UIChatController],
  exports: [UIFlowService, RequirementService, OrchestratorService],
})
export class UIProtocolModule {}
