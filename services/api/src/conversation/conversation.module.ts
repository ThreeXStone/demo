import { Module, forwardRef } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { MessageService } from './message.service';
import { AdvancedModule } from '../llm/advanced.module';

@Module({
  imports: [forwardRef(() => AdvancedModule)],
  controllers: [ConversationController],
  providers: [ConversationService, MessageService],
  exports: [ConversationService, MessageService],
})
export class ConversationModule {}
