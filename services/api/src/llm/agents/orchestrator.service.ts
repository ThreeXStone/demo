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

export interface ProgressEvent {
  step: string;
  status: 'started' | 'completed';
  message: string;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  async orchestrate(
    input: string,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<OrchestrateResult> {
    const emit = (step: string, status: 'started' | 'completed', message: string) => {
      this.logger.log(`[${step}] ${status}: ${message}`);
      onProgress?.({ step, status, message });
    };

    try {
      // 第一步：抽取
      emit('extractAgent', 'started', '正在提取需求信息...');
      const extractResult = await extractAgent.invoke({ input });
      const json = extractResult.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
      const parsed = JSON.parse(json || extractResult);
      emit('extractAgent', 'completed', `需求提取完成: orderId=${parsed.orderId}, requestType=${parsed.requestType}`);

      // 检查关键字段
      let clarificationQuestions: string[] = [];
      if (!parsed.orderId) clarificationQuestions.push('请提供订单号');
      if (!parsed.requestType) clarificationQuestions.push('请说明是退货、换货还是退款');
      if (!parsed.receivedDate) clarificationQuestions.push('请提供收货日期');
      if (parsed.isUnopened === null) clarificationQuestions.push('请确认商品是否未拆封');

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
      emit('policyCheckAgent', 'started', '正在进行政策校验...');
      emit('riskReviewAgent', 'started', '正在进行风险审查...');
      const [policyResult, riskResult] = await Promise.all([
        policyCheckAgent.invoke({ extractResult }),
        riskReviewAgent.invoke({ extractResult }),
      ]);
      emit('policyCheckAgent', 'completed', '政策校验完成');
      emit('riskReviewAgent', 'completed', '风险审查完成');

      // 第三步：QA 验收条件
      emit('qaAgent', 'started', '正在生成验收条件...');
      const qaResult = await qaAgent.invoke({ input, extractResult });
      emit('qaAgent', 'completed', '验收条件生成完成');

      // 第四步：汇总
      emit('summaryAgent', 'started', '正在生成汇总报告...');
      const report = await summaryAgent.invoke({
        extractResult,
        policyResult,
        riskResult,
        qaResult,
      });
      emit('summaryAgent', 'completed', '汇总报告生成完成');

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
