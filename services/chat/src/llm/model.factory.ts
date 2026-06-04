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

/** 清除模型缓存 */
export function invalidateModelCache(modelName?: string): void {
  if (modelName) {
    for (const [key] of modelCache) {
      if (key.startsWith(modelName)) modelCache.delete(key);
    }
  } else {
    modelCache.clear();
  }
}
