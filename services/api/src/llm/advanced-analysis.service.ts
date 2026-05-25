import { Injectable, Logger } from '@nestjs/common';
import { RunnableMemoryService } from './memory/runnable-memory.service';
import { OrchestratorService, OrchestrateResult } from './agents/orchestrator.service';
import { VectorStoreService } from './embedding/vector-store.service';
import { FilesystemService } from './filesystem/filesystem.service';

export interface AnalysisResult {
  sessionId: string;
  input: string;
  analysis: OrchestrateResult;
  contextSummary?: string;
  relatedDocs?: any[];
}

@Injectable()
export class AdvancedAnalysisService {
  private readonly logger = new Logger(AdvancedAnalysisService.name);

  constructor(
    private memory: RunnableMemoryService,
    private orchestrator: OrchestratorService,
    private vectorStore: VectorStoreService,
    private files: FilesystemService,
  ) {}

  async analyze(sessionId: string, input: string): Promise<AnalysisResult> {
    this.logger.log(`[analyze] 开始分析，sessionId: ${sessionId}`);

    // 1. 从 Memory 读取历史
    const history = await this.memory.getHistory(sessionId);
    this.logger.log(`[analyze] 读取到 ${history.length} 条历史记录`);

    // 2. 拼接历史上下文和当前输入
    const enrichedInput = this.buildEnrichedInput(history, input);

    // 3. 调用 OrchestratorService 执行多 Agent 分析
    this.logger.log('[analyze] 调用 OrchestratorService');
    const result = await this.orchestrator.orchestrate(enrichedInput);

    // 4. 如果需要澄清，保存用户输入后返回
    if (result.fallback === 'ask_user') {
      this.logger.log('[analyze] 需要澄清，保存用户输入后返回');
      const clarifications = result.clarificationQuestions?.length
        ? `需要澄清：${result.clarificationQuestions.join(', ')}`
        : '需要更多信息';
      await this.memory.appendMessage(sessionId, input, clarifications);
      return {
        sessionId,
        input,
        analysis: result,
        contextSummary: `历史记录数: ${history.length}`,
        relatedDocs: [],
      };
    }

    // 5. 从 VectorStore 获取相关文档作为上下文补充
    const relatedDocs = await this.vectorStore.similaritySearchWithScore(input, 3);
    this.logger.log(`[analyze] 检索到 ${relatedDocs.length} 条相关文档`);

    // 6. 如果不需要澄清，将报告写入 tickets/ 目录
    if (!result.clarificationQuestions?.length && result.report) {
      const orderId = this.extractOrderId(history, input);
      const fileName = orderId ? `tickets/${orderId}-analysis.md` : `tickets/${sessionId}-analysis.md`;
      await this.writeFile(fileName, result.report);
      this.logger.log(`[analyze] 报告已写入: ${fileName}`);
    }

    // 7. 用 appendMessage 写回最终结论（不重新调用模型）
    await this.memory.appendMessage(sessionId, input, result.report || '分析完成');

    this.logger.log(`[analyze] 分析完成，mode: ${result.mode}, fallback: ${result.fallback}`);

    return {
      sessionId,
      input,
      analysis: result,
      contextSummary: `历史记录数: ${history.length}`,
      relatedDocs,
    };
  }

  private buildEnrichedInput(history: any[], input: string): string {
    const historyText = history
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const parts: string[] = [];
    if (history.length > 0) {
      parts.push(`历史上下文：\n${historyText}`);
    }
    parts.push(`当前输入：\n${input}`);
    return parts.join('\n\n');
  }

  private extractOrderId(history: any[], input: string): string | null {
    const text = [...history.map(h => h.content), input].join(' ');
    const match = text.match(/EC\d+/);
    return match ? match[0] : null;
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    await this.files.writeFile(filePath, content);
  }
}