import { Injectable, Logger } from '@nestjs/common';
import {
  extractAgent,
  policyCheckAgent,
  riskReviewAgent,
  qaAgent,
  summaryAgent,
} from './sub-agents';

export interface OrchestrateResult {
  mode: string;
  status?: string;
  clarificationQuestions: string[];
  usedAgents: string[];
  fallback: string | null;
  steps?: {
    extract: string;
    policyCheck?: string;
    riskReview?: string;
    qa?: string;
  };
  report?: string;
  error?: string;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  async orchestrate(input: string): Promise<OrchestrateResult> {
    try {
      // 第一步：抽取
      this.logger.log('[extractAgent] 开始执行...');
      const extractResult = await extractAgent.invoke({ input });
      const parsed = JSON.parse(extractResult);
      this.logger.log(`[extractAgent] 完成，结果: orderId=${parsed.orderId}, requestType=${parsed.requestType}, isUnopened=${parsed.isUnopened}`);

      // 检查关键字段
      let clarificationQuestions: string[] = [];
      if (!parsed.orderId) clarificationQuestions.push('请提供订单号');
      if (!parsed.requestType) clarificationQuestions.push('请说明是退货、换货还是退款');
      if (!parsed.receivedDate) clarificationQuestions.push('请提供收货日期');
      if (parsed.isUnopened === null) clarificationQuestions.push('请确认商品是否未拆封');

      // 缺少关键字段时终止流程
      if (clarificationQuestions.length > 0) {
        this.logger.warn(`[orchestrate] 缺少关键字段，需要澄清: ${clarificationQuestions.join(', ')}`);
        return {
          mode: 'fixed_workflow',
	  status: 'need_clarification',
          clarificationQuestions,
          usedAgents: ['RequirementExtractAgent'],
          fallback: 'ask_user',
        };
      }

      // 第二步：并行执行（政策校验 + 风险审查）
      this.logger.log('[policyCheckAgent, riskReviewAgent] 并行执行中...');
      const [policyResult, riskResult] = await Promise.all([
        policyCheckAgent.invoke({ extractResult }),
        riskReviewAgent.invoke({ extractResult }),
      ]);
      this.logger.log('[policyCheckAgent] 完成');
      this.logger.log('[riskReviewAgent] 完成');

      // 第三步：QA 验收条件
      this.logger.log('[qaAgent] 开始执行...');
      const qaResult = await qaAgent.invoke({ input, extractResult });
      this.logger.log('[qaAgent] 完成');

      // 第四步：汇总
      this.logger.log('[summaryAgent] 开始执行...');
      const report = await summaryAgent.invoke({
        extractResult,
        policyResult,
        riskResult,
        qaResult,
      });
      this.logger.log('[summaryAgent] 完成');
      this.logger.log('[orchestrate] 全流程执行完毕');

      return {
        mode: 'fixed_workflow',
        clarificationQuestions: [],
        usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
        fallback: null,
        steps: { extract: extractResult, policyCheck: policyResult, riskReview: riskResult, qa: qaResult },
        report,
      };
    } catch (error) {
      this.logger.error('[orchestrate] 执行失败', (error as Error).stack);
      return {
        mode: 'fixed_workflow',
        clarificationQuestions: [],
        usedAgents: ['RequirementExtractAgent'],
        fallback: 'manual_review',
        report: '分析流程失败，请转人工复核。',
        error: String(error),
      };
    }
  }
}
