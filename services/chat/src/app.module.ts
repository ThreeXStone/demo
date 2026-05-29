import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UIProtocolModule } from './llm/ui-protocol/ui-protocol.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    UIProtocolModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
