import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

@Injectable()
export class PostgresCheckpointerService implements OnModuleInit, OnModuleDestroy {
  private saver!: PostgresSaver;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const dbUrl = this.config.getOrThrow('DATABASE_URL');
    this.saver = PostgresSaver.fromConnString(dbUrl);
    await this.saver.setup();
    console.log('[Checkpointer] PostgresSaver 初始化完成');
  }

  async onModuleDestroy() {
    await this.saver?.end();
  }

  getCheckpointer(): PostgresSaver {
    return this.saver;
  }
}
