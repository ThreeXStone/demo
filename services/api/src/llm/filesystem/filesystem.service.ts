import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { loadLangChainConfig, getApiKeys } from '../../config/load-langchain-config';
import { businessTools } from '../tools/business.tools';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.join(process.cwd(), 'workspace');

function safePath(filePath: string) {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('路径不允许逃逸工作目录');
  }
  return resolved;
}

@Injectable()
export class FilesystemService {
  private readonly model: ChatOpenAI;
  private readonly toolMap: Record<string, any>;

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
    this.toolMap = Object.fromEntries(businessTools.map((t: any) => [t.name, t]));
  }

  async fileChat(input: string): Promise<string> {
    const modelWithTools = this.model.bindTools(businessTools);

    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是电商客服助手，可以调用以下工具：' +
        '1. query_order - 根据订单号查询订单详情' +
        '2. query_product - 根据商品ID查询商品详情' +
        '3. read_file - 读取 workspace 目录下的文件（政策、FAQ等）' +
        '4. write_file - 将内容写入 workspace 目录下的文件（工单、报告等）' +
        '\n所有文件路径都是相对路径，不需要加 workspace/ 前缀。'
      ),
      new HumanMessage(input),
    ];

    // 第一轮调用
    let response = await modelWithTools.invoke(messages);
    messages.push(response);

    // 工具循环：持续调用工具直到模型不再请求调用
    let maxIterations = 10;
    while (response.tool_calls && response.tool_calls.length > 0 && maxIterations > 0) {
      maxIterations--;

      // 执行所有工具调用
      for (const toolCall of response.tool_calls) {
        const targetTool = this.toolMap[toolCall.name];
        if (!targetTool) continue;

        try {
          const toolResult = await targetTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || '',
              content: JSON.stringify(toolResult),
            })
          );
        } catch (error) {
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || '',
              content: JSON.stringify({ error: (error as Error).message }),
            })
          );
        }
      }

      // 再次调用模型
      response = await modelWithTools.invoke(messages);
      messages.push(response);
    }

    return response.content.toString();
  }

  async readFile(filePath: string): Promise<string | { error: string }> {
    try {
      const full = safePath(filePath);
      if (!fs.existsSync(full)) return { error: '文件不存在' };
      return fs.readFileSync(full, 'utf8');
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const full = safePath(filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}