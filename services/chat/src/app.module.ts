import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UIProtocolModule } from './llm/ui-protocol/ui-protocol.module';
import { ConversationModule } from './conversation/conversation.module';
import { DocumentModule } from './document/document.module';
import { NotificationController } from './notification/notification.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

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
  ],
  controllers: [NotificationController],
  providers: [],
})
export class AppModule {}
