/**
 * experts.ts
 *
 * Supervisor + 多专家 ReAct 子图
 * 将原有单 Agent analysis 子图升级为 Supervisor 调度 + 4 个专家并行执行的架构。
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
// 工具暂未接入，expert-tools.ts 中的 mock 工具保留供后续使用
// import { ... } from './expert-tools';

// ---------------------------------------------------------------------------
// 局部 State（避免与 requirement-analysis-graph.ts 循环引用）
// ---------------------------------------------------------------------------

const SupervisorState = Annotation.Root({
  input: Annotation<string>({ default: () => '', reducer: (_, next) => next }),
  extracted: Annotation<Record<string, unknown>>({ default: () => ({}), reducer: (_, next) => next }),
  messages: Annotation<BaseMessage[]>({ default: () => [], reducer: (a, b) => a.concat(b) }),
  toolLoopCount: Annotation<number>({ default: () => 0, reducer: (_, next) => next }),
  analysisResult: Annotation<string>({ default: () => '', reducer: (_, next) => next }),
  functionalAnalysis: Annotation<string>({ default: () => '', reducer: (a, b) => b || a }),
  performanceAnalysis: Annotation<string>({ default: () => '', reducer: (a, b) => b || a }),
  securityAnalysis: Annotation<string>({ default: () => '', reducer: (a, b) => b || a }),
  complianceAnalysis: Annotation<string>({ default: () => '', reducer: (a, b) => b || a }),
  activeExperts: Annotation<string[]>({ default: () => ['functional'], reducer: (_, next) => next }),
});

type SupervisorStateType = typeof SupervisorState.State;

// ---------------------------------------------------------------------------
// 专家子图 State（每个专家内部使用的隔离 State）
// ---------------------------------------------------------------------------

const ExpertSubgraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: (a, b) => a.concat(b),
  }),
  extracted: Annotation<Record<string, unknown>>({
    default: () => ({}),
    reducer: (_, next) => next,
  }),
  toolLoopCount: Annotation<number>({
    default: () => 0,
    reducer: (_, next) => next,
  }),
  functionalAnalysis: Annotation<string>({ default: () => '', reducer: (_, next) => next }),
  performanceAnalysis: Annotation<string>({ default: () => '', reducer: (_, next) => next }),
  securityAnalysis: Annotation<string>({ default: () => '', reducer: (_, next) => next }),
  complianceAnalysis: Annotation<string>({ default: () => '', reducer: (_, next) => next }),
});

// ---------------------------------------------------------------------------
// 专家子图工厂
// ---------------------------------------------------------------------------

interface ExpertSubGraphOptions {
  name: string;
  model: BaseChatModel;
  tools: any[];
  systemPrompt: string;
  outputField: 'functionalAnalysis' | 'performanceAnalysis' | 'securityAnalysis' | 'complianceAnalysis';
  maxLoops?: number;
}

function createExpertSubGraph(opts: ExpertSubGraphOptions) {
  const { name, model, tools, systemPrompt, outputField, maxLoops = 6 } = opts;

  if (!model.bindTools) throw new Error(`[${name}] 当前模型不支持工具调用`);
  const modelWithTools = model.bindTools(tools);

  const logTS = () => new Date().toISOString();

  const agentNode = async (state: typeof ExpertSubgraphState.State) => {
    const loop = state.toolLoopCount + 1;
    console.log(`[LangGraph] ${logTS()} | ${name} ReAct START | round ${loop}/${maxLoops} | msgs=${state.messages.length}`);
    const t0 = Date.now();

    const messages = state.messages.length === 0
      ? [
          new SystemMessage(systemPrompt),
          new HumanMessage(`用户输入：\n需求抽取结果：${JSON.stringify(state.extracted)}`),
        ]
      : state.messages;

    try {
      const response = await modelWithTools.invoke(messages);
      const elapsed = Date.now() - t0;
      const tcCount = (response as any).tool_calls?.length || 0;
      console.log(`[LangGraph] ${logTS()} | ${name} ReAct DONE  | round ${loop} | ${elapsed}ms | tool_calls=${tcCount}`);
      return { messages: [response], toolLoopCount: loop };
    } catch (e) {
      console.error(`[${name}] agentNode 执行失败:`, (e as Error).message);
      return {
        messages: [new SystemMessage(`[${name} 专家暂不可用：${(e as Error).message.substring(0, 100)}]`)],
        toolLoopCount: loop,
      };
    }
  };

  const toolsNode = new ToolNode(tools);

  const finalizeNode = (state: typeof ExpertSubgraphState.State) => {
    const lastAi = [...state.messages].reverse().find((m) => m._getType() === 'ai');
    const content = typeof lastAi?.content === 'string' ? lastAi.content : '';
    // 检查 agentNode catch 是否写入了降级消息
    if (content.includes('暂不可用')) {
      console.log(`[LangGraph] ${logTS()} | ${name} FINALIZE    | degraded, resultLen=${content.length}`);
      return { [outputField]: content };
    }
    console.log(`[LangGraph] ${logTS()} | ${name} FINALIZE    | loops=${state.toolLoopCount} | resultLen=${content.length}`);
    return { [outputField]: content || `[${name} 专家未生成有效输出，请检查输入和工具配置]` };
  };

  const routeAfterAgent = (state: typeof ExpertSubgraphState.State): string => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (state.toolLoopCount >= maxLoops) {
      console.log(`[LangGraph] ${logTS()} | ${name} ROUTE      | max loops (${state.toolLoopCount}) → finalize`);
      return 'finalize';
    }
    const isAi = lastMsg._getType() === 'ai';
    const hasToolCalls = isAi && 'tool_calls' in lastMsg && (lastMsg as any).tool_calls?.length > 0;
    if (hasToolCalls) {
      const tcNames = (lastMsg as any).tool_calls.map((tc: any) => tc.name).join(', ');
      console.log(`[LangGraph] ${logTS()} | ${name} ROUTE      | tool_calls: [${tcNames}] → tools`);
      return 'tools';
    }
    console.log(`[LangGraph] ${logTS()} | ${name} ROUTE      | no tool calls → finalize`);
    return 'finalize';
  };

  return new StateGraph(ExpertSubgraphState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent, { tools: 'tools', finalize: 'finalize' })
    .addEdge('tools', 'agent')
    .addEdge('finalize', END)
    .compile();
}

// ---------------------------------------------------------------------------
// 四个专家 System Prompts
// ---------------------------------------------------------------------------

const FUNCTIONAL_EXPERT_PROMPT = `你是功能分析专家。根据用户输入和已抽取的需求信息，进行功能维度分析，输出 Markdown 报告：

1. 功能拆解与边界：拆分为子功能模块，标注各模块职责范围和边界（包含/不包含）；子功能超8个时只展开前5个，其余表格列出
2. 依赖关系：描述子功能间依赖和调用顺序，标注关键路径及潜在冲突
3. 验收标准：每条格式 [子功能]+[具体指标]+[通过条件]，可量化可测试
4. 边界外事项：明确不在此需求范围的功能`;

const PERFORMANCE_EXPERT_PROMPT = `你是性能分析专家。根据用户输入和已抽取的需求信息，进行性能维度分析，输出 Markdown 报告：

1. 性能需求清单：表格列出 QPS/延迟/并发/可用性等指标，标注目标值和来源
2. 基线对比：与同类系统对比，标记偏离基线的指标并分析合理性
3. 资源预算：估算 CPU/内存/实例数、存储容量/IOPS、网络带宽/连接数
4. 瓶颈与优化：识别瓶颈点，提出优化建议，标注高风险指标`;

const SECURITY_EXPERT_PROMPT = `你是安全分析专家。根据用户输入和已抽取的需求信息，进行安全维度分析，输出 Markdown 报告：

1. 安全需求清单：列出认证/授权/加密/审计/防护需求，标注安全等级（高/中/低）
2. 威胁评估：识别威胁向量（对照 OWASP Top 10），评估可能性和影响，给出缓解措施
3. 认证与授权：推荐认证流程，定义角色权限矩阵，标注敏感操作的额外控制
4. 数据保护：传输安全（TLS/加密）、存储安全（加密方式/密钥管理）、日志审计范围`;

const COMPLIANCE_EXPERT_PROMPT = `你是合规分析专家。根据用户输入和已抽取的需求信息，进行合规维度分析，输出 Markdown 报告：

1. 适用法规：列出相关法律法规和行业标准（GDPR/等保2.0/PCI-DSS/HIPAA），标注适用条款
2. 数据驻留：分析数据存储地理位置、跨境传输条件、数据本地化要求
3. 保留策略：各类数据保留期限、归档/删除策略、生命周期管理建议
4. 合规差距：识别差距，提出弥补措施，标注高风险合规点及业务影响`;

// ---------------------------------------------------------------------------
// 四个专家工厂
// ---------------------------------------------------------------------------

export function createFunctionalExpert(model: BaseChatModel) {
  return createExpertSubGraph({
    name: 'functional',
    model,
    tools: [],
    systemPrompt: FUNCTIONAL_EXPERT_PROMPT,
    outputField: 'functionalAnalysis',
  });
}

export function createPerformanceExpert(model: BaseChatModel) {
  return createExpertSubGraph({
    name: 'performance',
    model,
    tools: [],
    systemPrompt: PERFORMANCE_EXPERT_PROMPT,
    outputField: 'performanceAnalysis',
  });
}

export function createSecurityExpert(model: BaseChatModel) {
  return createExpertSubGraph({
    name: 'security',
    model,
    tools: [],
    systemPrompt: SECURITY_EXPERT_PROMPT,
    outputField: 'securityAnalysis',
  });
}

export function createComplianceExpert(model: BaseChatModel) {
  return createExpertSubGraph({
    name: 'compliance',
    model,
    tools: [],
    systemPrompt: COMPLIANCE_EXPERT_PROMPT,
    outputField: 'complianceAnalysis',
  });
}

// ---------------------------------------------------------------------------
// Supervisor 节点
// ---------------------------------------------------------------------------

const supervisorSchema = z.object({
  experts: z.array(z.enum(['functional', 'performance', 'security', 'compliance']))
    .min(1)
    .describe('需要激活的专家列表。functional=功能分析, performance=性能分析, security=安全分析, compliance=合规分析'),
  reason: z.string().describe('激活理由，简要说明为什么选择这些专家'),
});

const SUPERVISOR_PROMPT = `你是分析主管。根据用户输入和已抽取的需求信息，判断需要哪些专家参与分析。

## 专家类型
- functional: 功能分析专家 — 功能拆解、边界定义、依赖分析、验收标准
- performance: 性能分析专家 — 性能需求、基线对比、资源预算、瓶颈识别
- security: 安全分析专家 — 安全需求、威胁评估、认证授权、数据保护
- compliance: 合规分析专家 — 法规合规、数据驻留、保留策略、合规差距

## 决策规则
1. 如果需求明确涉及功能描述、模块划分、用户交互 → 激活 functional
2. 如果需求提到性能指标（QPS、延迟、并发、批量、实时）→ 激活 performance
3. 如果需求涉及用户认证、权限、数据访问、文件上传 → 激活 security
4. 如果需求涉及合规（个人信息、跨境、金融/医疗行业）→ 激活 compliance
5. 如果无法判断，默认至少激活 functional
6. 默认激活 functional；其余专家仅在需求有明确信号时激活，避免过度激活

## 输出格式
以 JSON 格式输出：{"experts":["functional","performance"],"reason":"理由说明"}`;

function createSupervisorNode(model: BaseChatModel) {
  const modelWithStructuredOutput = model.withStructuredOutput(supervisorSchema, { method: 'jsonMode' });

  return async (state: SupervisorStateType): Promise<Partial<SupervisorStateType>> => {
    try {
      const result = await modelWithStructuredOutput.invoke([
        new SystemMessage(SUPERVISOR_PROMPT),
        new HumanMessage(`用户输入：${state.input}\n\n需求抽取结果：${JSON.stringify(state.extracted)}`),
      ]);
      console.log(`[LangGraph] supervisor → experts: [${result.experts.join(', ')}] | reason: ${result.reason}`);
      return { activeExperts: result.experts };
    } catch (e) {
      console.log(`[LangGraph] supervisor failed: ${(e as Error).message}, defaulting to functional`);
      return { activeExperts: ['functional'] };
    }
  };
}

// ---------------------------------------------------------------------------
// 路由：条件边返回数组 → 并行触发专家
// ---------------------------------------------------------------------------

function routeToExperts(state: SupervisorStateType): string[] {
  const routes = state.activeExperts.map((e) => `${e}_expert`);
  console.log(`[LangGraph] routeToExperts → [${routes.join(', ')}]`);
  return routes;
}

// ---------------------------------------------------------------------------
// Aggregator 节点
// ---------------------------------------------------------------------------

const expertLabel: Record<string, string> = {
  functional: '功能分析',
  performance: '性能分析',
  security: '安全分析',
  compliance: '合规分析',
};

function createAggregatorNode() {
  return (state: SupervisorStateType): Partial<SupervisorStateType> => {
    const sections: string[] = [];
    const fieldMap: Record<string, string> = {
      functional: 'functionalAnalysis',
      performance: 'performanceAnalysis',
      security: 'securityAnalysis',
      compliance: 'complianceAnalysis',
    };

    for (const expert of state.activeExperts) {
      const content = (state as any)[fieldMap[expert]] as string;
      if (content && content.trim()) {
        if (content.includes('暂不可用')) {
          sections.push(`## ${expertLabel[expert]}（降级）\n\n⚠️ ${content}`);
        } else {
          sections.push(`## ${expertLabel[expert]}\n\n${content}`);
        }
      }
    }

    const analysisResult = sections.length > 0
      ? `# 需求综合分析报告\n\n${sections.join('\n\n---\n\n')}`
      : '分析服务暂不可用，请稍后重试。';

    console.log(`[LangGraph] aggregator: merged ${sections.length}/${state.activeExperts.length} expert outputs (${analysisResult.length} chars)`);
    return { analysisResult };
  };
}

// ---------------------------------------------------------------------------
// Supervisor 子图装配
// ---------------------------------------------------------------------------

export function createAnalysisSupervisorSubGraph(model: BaseChatModel) {
  const supervisorNode = createSupervisorNode(model);

  const functionalExpert = createFunctionalExpert(model);
  const performanceExpert = createPerformanceExpert(model);
  const securityExpert = createSecurityExpert(model);
  const complianceExpert = createComplianceExpert(model);

  const aggregatorNode = createAggregatorNode();

  return new StateGraph(SupervisorState)
    .addNode('supervisor', supervisorNode)
    .addNode('functional_expert', functionalExpert)
    .addNode('performance_expert', performanceExpert)
    .addNode('security_expert', securityExpert)
    .addNode('compliance_expert', complianceExpert)
    .addNode('aggregator', aggregatorNode)
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', routeToExperts, {
      functional_expert: 'functional_expert',
      performance_expert: 'performance_expert',
      security_expert: 'security_expert',
      compliance_expert: 'compliance_expert',
    })
    .addEdge('functional_expert', 'aggregator')
    .addEdge('performance_expert', 'aggregator')
    .addEdge('security_expert', 'aggregator')
    .addEdge('compliance_expert', 'aggregator')
    .addEdge('aggregator', END)
    .compile();
}
