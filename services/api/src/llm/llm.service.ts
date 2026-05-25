import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { requirementPromptTemplate } from './requirement.prompt-builder';
import { requirementChain } from './requirement.chain';
import { basicTools } from './tools/basic.tools';
import { ChatOpenAI } from '@langchain/openai';
import { loadLangChainConfig, getApiKeys } from '../config/load-langchain-config';

@Injectable()
export class LlmService {
  private readonly systemPrompt = '需求结构化抽取助手';
  private readonly model: ChatOpenAI;

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
      chatConfig.configuration = { baseURL: openaiBaseURL };
    }

    this.model = new ChatOpenAI(chatConfig);
  }

  async invoke(input: string): Promise<string> {
    const messages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(input),
    ];
    const result = await this.model.invoke(messages);
    return result.content as string;
  }

  async *stream(input: string): AsyncGenerator<string> {
    const messages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(input),
    ];
    const stream = await this.model.stream(messages);

    for await (const chunk of stream) {
      const content = chunk.content;
      if (typeof content === 'string') {
        yield content;
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item === 'string') {
            yield item;
          }
        }
      }
    }
  }

  async batch(inputs: string[]): Promise<string[]> {
    const messagesList = inputs.map(
      input => [new SystemMessage(this.systemPrompt), new HumanMessage(input)]
    );
    const results = await this.model.batch(messagesList);
    return results.map(r => r.content as string);
  }

  async renderPrompt(input: string): Promise<{ system: string; user: string; formatted: string[] }> {
    const messages = await requirementPromptTemplate.formatMessages({ input });
    return {
      system: messages[0].content as string,
      user: messages[1].content as string,
      formatted: messages.map((m: any) => m.content as string),
    };
  }

  async invokeWithTemplate(input: string): Promise<string> {
    const messages = await requirementPromptTemplate.formatMessages({ input });
    const result = await this.model.invoke(messages);
    return result.content as string;
  }

  async chainInvoke(input: string) {
    const result = await requirementChain.invoke({ input });
    return { result };
  }

  async *chainStream(input: string): AsyncGenerator<string> {
    const stream = await requirementChain.stream({ input });
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  async chainBatch(inputs: string[]) {
    const results = await requirementChain.batch(inputs.map(input => ({ input })));
    return { results };
  }

  async toolBind(input: string) {
    const modelWithTools = this.model.bindTools(basicTools);

    const response = await modelWithTools.invoke([
      new SystemMessage('你可以按需要调用工具来校验约束和查询实体定义。'),
      new HumanMessage(`请分析下面需求：${input}`),
    ]);

    return {
      result: response.content.toString(),
      toolCalls: response.tool_calls as any[],
    };
  }

  async toolLoop(input: string) {
    const toolMap = Object.fromEntries(basicTools.map((t: any) => [t.name, t]));
    const modelWithTools = this.model.bindTools(basicTools);

    const messages: BaseMessage[] = [
      new SystemMessage('你可以调用工具来帮助完成需求抽取后的校验。'),
      new HumanMessage(
        `先抽取 action、constraints、entities，再按需要调用工具：${input}`
      ),
    ];

    const firstResponse = await modelWithTools.invoke(messages);
    messages.push(firstResponse);

    for (const toolCall of firstResponse.tool_calls ?? []) {
      const targetTool = toolMap[toolCall.name];
      if (!targetTool) continue;
      const toolResult = await (targetTool as any).invoke(toolCall.args);
      messages.push(
        new ToolMessage({
          tool_call_id: toolCall.id || '',
          content: JSON.stringify(toolResult),
        })
      );
    }

    const finalResponse = await modelWithTools.invoke(messages);
    return { result: finalResponse.content.toString() };
  }
}