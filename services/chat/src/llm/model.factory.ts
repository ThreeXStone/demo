import { ChatOpenAI } from '@langchain/openai';

const modelCache = new Map<string, ChatOpenAI>();

export interface ModelFactoryOptions {
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * 创建 ChatOpenAI 实例，按 modelName 缓存。
 */
export function createChatModel(options: ModelFactoryOptions): ChatOpenAI {
  const {
    modelName,
    temperature = 0.3,
    maxTokens = 2048,
    baseUrl,
    apiKey,
  } = options;

  const cacheKey = `${modelName}::${baseUrl || ''}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  const instance = new ChatOpenAI({
    model: modelName,
    temperature,
    maxTokens,
    timeout: 120_000,
    apiKey,
    configuration: {
      baseURL: baseUrl || 'https://api.deepseek.com/v1',
      timeout: 120_000,
    },
  });

  modelCache.set(cacheKey, instance);
  return instance;
}

/**
 * 根据数据库 ModelConfig 记录创建 ChatOpenAI 实例。
 * 缓存键为 config.id，纯函数，无 DI 依赖。
 */
export function createChatModelFromDbConfig(config: {
  id: string;
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}): ChatOpenAI {
  const cached = modelCache.get(config.id);
  if (cached) return cached;

  const instance = new ChatOpenAI({
    model: config.model,
    temperature: 0.3,
    maxTokens: 2048,
    timeout: 120_000,
    apiKey: config.apiKey ?? undefined,
    configuration: {
      baseURL: config.baseUrl || 'https://api.deepseek.com/v1',
      timeout: 120_000,
    },
  });

  modelCache.set(config.id, instance);
  return instance;
}

/** 清除指定 modelConfigId 的缓存 */
export function invalidateModelCache(modelConfigId: string): void {
  modelCache.delete(modelConfigId);
}

/**
 * 创建轻量模型实例（deepseek-v4-flash，maxTokens=512）。
 * 用于 triage / extract / risk 等结构化输出或简单判断节点。
 */
export function createLightChatModel(apiKey?: string, baseUrl?: string): ChatOpenAI {
  const cacheKey = `light::${apiKey?.slice(-8) || 'none'}::${baseUrl || 'default'}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  const instance = new ChatOpenAI({
    model: 'deepseek-v4-flash',
    temperature: 0.3,
    maxTokens: 512,
    timeout: 120_000,
    apiKey,
    configuration: {
      baseURL: baseUrl || 'https://api.deepseek.com/v1',
      timeout: 120_000,
    },
  });

  modelCache.set(cacheKey, instance);
  return instance;
}
