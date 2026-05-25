import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { LlmModule } from './llm/llm.module';
import { AdvancedModule } from './llm/advanced.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LlmModule,
    AdvancedModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
