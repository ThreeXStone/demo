import { Module, OnModuleInit } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { ModelConfigController } from './model-config.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ModelConfigService],
  controllers: [ModelConfigController],
  exports: [ModelConfigService],
})
export class ModelConfigModule implements OnModuleInit {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  async onModuleInit() {
    await this.modelConfigService.ensureDefaults();
  }
}
