import { Module } from '@nestjs/common';
import { UIResponseService } from './ui-response.service';
import { UIFlowService } from './ui-flow.service';
import { RequirementService } from './requirement.service';
import { UIChatController } from './ui-chat.controller';

@Module({
  providers: [UIResponseService, UIFlowService, RequirementService],
  controllers: [UIChatController],
  exports: [UIResponseService, UIFlowService, RequirementService],
})
export class UIProtocolModule {}
