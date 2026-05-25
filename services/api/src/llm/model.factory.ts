import { ChatOpenAI } from '@langchain/openai';
import { loadLangChainConfig, getApiKeys } from '../config/load-langchain-config';

export function createChatModel(): any {
  const config = loadLangChainConfig();
  const { openaiApiKey, openaiBaseURL } = getApiKeys();

  const chatConfig: any = {
    model: config.llm.model,
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
    topP: config.llm.topP,
  };

  if (openaiApiKey) {
    chatConfig.apiKey = openaiApiKey;
  }

  if (openaiBaseURL) {
    chatConfig.configuration = {
      baseURL: openaiBaseURL,
    };
  }

  return new ChatOpenAI(chatConfig);
}