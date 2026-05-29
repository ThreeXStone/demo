import { Module } from '@nestjs/common';
import { UIResponseService } from './ui-response.service';
import { UIChatController } from './ui-chat.controller';

@Module({
  providers: [UIResponseService],
  controllers: [UIChatController],
  exports: [UIResponseService],
})
export class UIProtocolModule {}
