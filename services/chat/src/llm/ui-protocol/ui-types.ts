// ============================================================
// Orchestrator 相关类型
// ============================================================

/** Orchestrator 流式事件类型 */
export type OrchestratorStreamEvent =
  | { type: 'agent_start'; agent: string; step: number; totalSteps: number; parallel?: boolean }
  | { type: 'token'; content: string; agent: string }
  | { type: 'agent_end'; agent: string; step: number; parallel?: boolean }
  | { type: 'log'; level: 'info' | 'debug' | 'error'; message: string; data?: Record<string, any> }
  | { type: 'final'; result: OrchestratorResult };

/** Orchestrator 执行结果 */
export interface OrchestratorResult {
  responseType: 'markdown' | 'ui';
  mode: 'fixed';
  usedAgents: string[];
  steps: Record<string, string>;
  report?: string;
  thinking?: string;
  // clarify 流程字段
  needsClarification?: boolean;
  currentQuestion?: { id: string; question: string; options: string[] } | null;
  questions?: { id: string; question: string; options: string[]; answer: string | null; retryCount: number; skipped: boolean; status: string }[];
  clarifiedData?: Record<string, string>;
  retryHint?: string;
  extracted?: Record<string, unknown>;
}
