import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface LangChainConfig {
  llm: {
    model: string;
    temperature: number;
    maxTokens: number;
    topP: number;
  };
  retrieval: {
    topK: number;
    scoreThreshold: number;
  };
  tools: {
    enabled: string[];
    timeout: number;
  };
  features: {
    streaming: boolean;
    batchProcessing: boolean;
    caching: boolean;
  };
}

let configCache: LangChainConfig | null = null;

export function loadLangChainConfig(): LangChainConfig {
  if (configCache) {
    return configCache;
  }

  const configPath = path.join(process.cwd(), 'config', 'langchain.yaml');
  const fileContents = fs.readFileSync(configPath, 'utf8');
  configCache = yaml.load(fileContents) as LangChainConfig;
  return configCache;
}

export function getApiKeys() {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiBaseURL: process.env.OPENAI_BASE_URL || '',
    embeddingApiKey: process.env.EMBEDDING_API_KEY || '',
    vectorDbUrl: process.env.VECTOR_DB_URL || '',
    vectorDbApiKey: process.env.VECTOR_DB_API_KEY || '',
  };
}