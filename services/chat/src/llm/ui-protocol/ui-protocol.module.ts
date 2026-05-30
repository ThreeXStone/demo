import { Module } from '@nestjs/common';
import { UIFlowService } from './ui-flow.service';
import { RequirementService } from './requirement.service';
import { UIChatController } from './ui-chat.controller';

@Module({
  providers: [UIFlowService, RequirementService],
  controllers: [UIChatController],
  exports: [UIFlowService, RequirementService],
})
export class UIProtocolModule {}
