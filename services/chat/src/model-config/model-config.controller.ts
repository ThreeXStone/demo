import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ModelConfigService } from './model-config.service';

@Controller('chat/model-configs')
export class ModelConfigController {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  /** 获取可用模型列表（前端选择器） */
  @Get('available')
  async findAvailable(@Query('type') type: string = 'general') {
    return this.modelConfigService.findActiveByType(type);
  }

  /** 获取默认模型 */
  @Get('default')
  async findDefault(@Query('type') type: string = 'general') {
    return this.modelConfigService.findDefaultByType(type);
  }

  /** 全部模型 */
  @Get()
  async findAll() {
    return this.modelConfigService.findAll();
  }

  /** 按 ID 获取 */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.modelConfigService.findById(id);
  }

  /** 创建 */
  @Post()
  async create(@Body() dto: any) {
    return this.modelConfigService.create(dto);
  }

  /** 更新 */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.modelConfigService.update(id, dto);
  }

  /** 删除 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.modelConfigService.delete(id);
  }
}
