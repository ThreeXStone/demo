import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UIProtocolModule } from './llm/ui-protocol/ui-protocol.module';
import { ConversationModule } from './conversation/conversation.module';
import { DocumentModule } from './document/document.module';
import { NotificationController } from './notification/notification.controller';
import { LogsController } from './logging/logs.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ModelConfigModule } from './model-config/model-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    ConversationModule,
    DocumentModule,
    UIProtocolModule,
    ModelConfigModule,
  ],
  controllers: [NotificationController, LogsController],
  providers: [],
})
export class AppModule {}
