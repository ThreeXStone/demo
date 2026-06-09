import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { invalidateModelCache } from '../llm/model.factory';

const SENSITIVE_FIELDS = { apiKey: false, baseUrl: false } as const;

const PUBLIC_SELECT = {
  id: true, name: true, provider: true, model: true,
  type: true, priority: true, isActive: true, isDefault: true,
  capabilities: true, createdAt: true, updatedAt: true,
} as const;

export interface CreateModelConfigDto {
  name: string;
  provider?: string;
  model: string;
  type?: string;
  priority?: number;
  baseUrl?: string;
  apiKey?: string;
  isActive?: boolean;
  isDefault?: boolean;
  capabilities?: string[];
}

export interface UpdateModelConfigDto {
  name?: string;
  provider?: string;
  model?: string;
  type?: string;
  priority?: number;
  baseUrl?: string;
  apiKey?: string;
  isActive?: boolean;
  isDefault?: boolean;
  capabilities?: string[];
}

@Injectable()
export class ModelConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 按 ID 查询完整记录（含 apiKey/baseUrl，内部用） */
  async findById(id: string) {
    const config = await this.prisma.model_configs.findUnique({ where: { id } });
    if (!config) throw new NotFoundException(`模型配置不存在: ${id}`);
    return config;
  }

  /** 按 model 字符串查询完整记录（内部用） */
  async findByModel(model: string) {
    return this.prisma.model_configs.findUnique({ where: { model } });
  }

  /** 按类型查询激活模型列表（前端选择器，不含敏感字段） */
  async findActiveByType(type: string) {
    return this.prisma.model_configs.findMany({
      where: { type, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }],
      select: PUBLIC_SELECT,
    });
  }

  /** 查询默认模型（前端 fallback，不含敏感字段） */
  async findDefaultByType(type: string) {
    return this.prisma.model_configs.findFirst({
      where: { type, isActive: true, isDefault: true },
      select: PUBLIC_SELECT,
    });
  }

  /** 全部模型（管理后台，不含敏感字段） */
  async findAll() {
    return this.prisma.model_configs.findMany({
      orderBy: [{ type: 'asc' }, { priority: 'desc' }],
      select: PUBLIC_SELECT,
    });
  }

  /** 创建模型配置 */
  async create(dto: CreateModelConfigDto) {
    if (dto.isDefault) {
      await this.prisma.model_configs.updateMany({
        where: { type: dto.type ?? 'general', isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.model_configs.create({
      data: {
        name: dto.name,
        provider: dto.provider ?? 'openai',
        model: dto.model,
        type: dto.type ?? 'general',
        priority: dto.priority ?? 0,
        baseUrl: dto.baseUrl,
        apiKey: dto.apiKey,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
        capabilities: dto.capabilities ?? ['text'],
      },
    });
  }

  /** 更新模型配置（同时清除缓存） */
  async update(id: string, dto: UpdateModelConfigDto) {
    await this.findById(id);

    if (dto.isDefault) {
      const config = await this.findById(id);
      await this.prisma.model_configs.updateMany({
        where: { type: config.type, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.model_configs.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.baseUrl !== undefined && { baseUrl: dto.baseUrl }),
        ...(dto.apiKey !== undefined && { apiKey: dto.apiKey }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.capabilities !== undefined && { capabilities: dto.capabilities }),
      },
    });

    invalidateModelCache(id);
    return updated;
  }

  /** 删除模型配置 */
  async delete(id: string) {
    await this.findById(id);
    return this.prisma.model_configs.delete({ where: { id } });
  }

  /** 按 model 字段 upsert（初始化幂等） */
  async upsertByModel(model: string, data: {
    name: string;
    provider: string;
    baseUrl: string;
    apiKey: string;
    isDefault: boolean;
    type: string;
    capabilities?: string[];
  }) {
    return this.prisma.model_configs.upsert({
      where: { model },
      create: {
        ...data,
        model,
        priority: 0,
        isActive: true,
      },
      update: {
        name: data.name,
        provider: data.provider,
        baseUrl: data.baseUrl,
        apiKey: data.apiKey,
        type: data.type,
        isActive: true,
        ...(data.capabilities && { capabilities: data.capabilities }),
      },
    });
  }

  /** 初始化：从 .env 同步默认配置到数据库（幂等） */
  async ensureDefaults() {
    await this.upsertByModel('deepseek-v4-pro', {
      name: 'DeepSeek V4 Pro',
      provider: 'openai',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      isDefault: true,
      type: 'general',
    });

    if (process.env.GPT_API_KEY) {
      await this.upsertByModel('gpt-5.4', {
        name: 'GPT-5',
        provider: 'openai',
        baseUrl: process.env.GPT_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.GPT_API_KEY,
        isDefault: false,
        type: 'general',
      });
    }
  }
}
