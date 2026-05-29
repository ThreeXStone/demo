import { Injectable, Logger } from '@nestjs/common';
import { MessageService } from '../conversation/message.service';
import { SearchService } from '../embedding/search.service';
import { OrchestratorService, OrchestrateResult } from './agents/orchestrator.service';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

export interface AnalysisResult {
  report?: string;
  usedAgents: string[];
  retrievedDocuments: {
    documentName?: string;
    content: string;
    score: number;
  }[];
  status?: string;
  clarificationQuestions?: string[];
  steps?: OrchestrateResult['steps'];
}

@Injectable()
export class AdvancedAnalysisService {
  private readonly logger = new Logger(AdvancedAnalysisService.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly searchService: SearchService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async analyze(
    userId: string,
    conversationId: string,
    input: string,
  ): Promise<AnalysisResult> {
    this.logger.log(`[analyze] conversationId=${conversationId}`);

    // 1. 读取会话历史
    const historyRows = await this.messageService.getHistory(conversationId);
    const historyMessages = await this.messageService.getHistoryAsLangChainMessages(conversationId);
    this.logger.log(`[analyze] 历史消息: ${historyRows.length} 条`);

    // 2. 语义检索用户文档
    const retrievedDocs = await this.searchService.similaritySearch(input, userId, 3);
    this.logger.log(`[analyze] 检索到 ${retrievedDocs.length} 条相关文档`);

    // 3. 组装完整上下文
    const contextParts: string[] = [];

    if (historyMessages.length > 0) {
      const historyText = historyMessages
        .map((m) => `${m._getType()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n');
      contextParts.push(`历史对话：\n${historyText}`);
    }

    if (retrievedDocs.length > 0) {
      const docsText = retrievedDocs
        .map((d) => `[相关文档片段，相似度: ${d.score.toFixed(2)}]\n${d.content}`)
        .join('\n---\n');
      contextParts.push(`相关文档：\n${docsText}`);
    }

    contextParts.push(`当前输入：${input}`);
    const enrichedInput = contextParts.join('\n\n');

    // 4. 调用 Multi-Agent 分析
    const result = await this.orchestrator.orchestrate(enrichedInput);

    // 5. 写入消息历史
    await this.messageService.addMessage(conversationId, 'human', input);
    await this.messageService.addMessage(
      conversationId,
      'ai',
      result.report || (result.clarificationQuestions?.length
        ? `需要更多信息：${result.clarificationQuestions.join('；')}`
        : '分析完成'),
    );

    // 6. 返回完整结果
    return {
      report: result.report,
      usedAgents: result.usedAgents,
      retrievedDocuments: retrievedDocs.map((d) => ({
        content: d.content.slice(0, 200) + (d.content.length > 200 ? '...' : ''),
        score: d.score,
      })),
      status: result.status,
      clarificationQuestions: result.clarificationQuestions,
      steps: result.steps,
    };
  }
}
