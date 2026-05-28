import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { LlmModule } from './llm/llm.module';
import { AdvancedModule } from './llm/advanced.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LlmModule,
    AdvancedModule,
    PrismaModule,
    AuthModule,
    ConversationModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
