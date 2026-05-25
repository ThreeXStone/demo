import { Injectable } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { REQUIREMENT_SYSTEM_PROMPT, REQUIREMENT_USER_TEMPLATE } from './prompts/requirement.prompt';
import { ChatOpenAI } from '@langchain/openai';
import { loadLangChainConfig, getApiKeys } from '../config/load-langchain-config';
import { RequirementResult, RequirementResultSchema } from '@repo/contracts';
import type { Runnable } from '@langchain/core/runnables';

@Injectable()
export class RequirementService {
  private readonly promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', REQUIREMENT_SYSTEM_PROMPT],
    ['user', REQUIREMENT_USER_TEMPLATE],
  ]);

  private readonly model: any;

  constructor() {
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

    this.model = new ChatOpenAI(chatConfig).withStructuredOutput(RequirementResultSchema);
  }

  async extract(input: string): Promise<RequirementResult> {
    const messages = await this.promptTemplate.formatMessages({ input });
    const result = await this.model.invoke(messages);
    return result as unknown as RequirementResult;
  }
}