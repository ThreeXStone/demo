import { Module } from '@nestjs/common';
import { UIResponseService } from './ui-response.service';
import { UIFlowService } from './ui-flow.service';
import { UIChatController } from './ui-chat.controller';

@Module({
  providers: [UIResponseService, UIFlowService],
  controllers: [UIChatController],
  exports: [UIResponseService, UIFlowService],
})
export class UIProtocolModule {}
