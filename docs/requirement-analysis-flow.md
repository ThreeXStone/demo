# 需求分析流程图

## 整体流程（Main Graph）

```mermaid
flowchart TD
    START((START)) --> triage[🏷️ triage<br/>意图分类]

    triage --> triageRoute{{"intent?"}}

    triageRoute -->|"chat（闲聊/问候）"| END_CHAT([END<br/>直接回答])
    triageRoute -->|"query（查询需求状态）"| queryHandler[🔍 queryHandler<br/>查询处理]
    triageRoute -->|"analyze（需求分析）"| extractStep[📋 extractStep<br/>需求提取 → JSON]

    queryHandler --> END_QUERY([END])

    extractStep --> clarifyStep[❓ clarifyStep<br/>澄清判断]

    clarifyStep --> clarifyRoute{{"needsClarification?"}}

    clarifyRoute -->|"是，需要澄清"| END_CLARIFY([END<br/>返回追问列表])
    clarifyRoute -->|"否，信息完整"| parallelGate[/"并行执行"/]

    parallelGate --> analysisStep
    parallelGate --> riskStep

    subgraph analysisSubgraph["🧠 analysisStep（Supervisor + 多专家子图）"]
        supervisor[🎯 supervisor<br/>选择激活专家]
        supervisor --> expertRoute{{"激活哪些专家?"}}

        expertRoute -->|"并行"| functionalExpert
        expertRoute -->|"并行"| performanceExpert
        expertRoute -->|"并行"| securityExpert
        expertRoute -->|"并行"| complianceExpert

        functionalExpert --> aggregator[📊 aggregator<br/>汇总专家报告]
        performanceExpert --> aggregator
        securityExpert --> aggregator
        complianceExpert --> aggregator
    end

    riskStep[⚠️ riskStep<br/>风险评估]

    riskStep --> summaryStep
    aggregator --> summaryStep

    subgraph summarySubgraph["✍️ summaryStep（Critic-Refine 子图）"]
        actor[🎭 actor<br/>生成初版报告]
        actor --> critic[🔍 critic<br/>质量标准评审]
        critic --> refineRoute{{"pass?"}}
        refineRoute -->|"通过"| summaryEnd((✓))
        refineRoute -->|"修订次数 ≥ 2"| summaryEnd
        refineRoute -->|"未通过"| refine[🔧 refine<br/>修订报告]
        refine --> critic
    end

    summaryEnd --> END_FINAL([END<br/>SSE 推送最终报告])
```

## 专家子图内部结构（ReAct 循环）

每个专家（functional / performance / security / compliance）都是一个独立的 ReAct 子图：

```mermaid
flowchart TD
    expStart((START)) --> agent[🤖 agent<br/>LLM 分析 + 工具调用决策]

    agent --> toolRoute{{"需要调用工具?"}}

    toolRoute -->|"需要调用工具"| tools[🔧 tools<br/>执行工具函数]
    toolRoute -->|"不需要 / 达到硬上限"| finalize[✅ finalize<br/>整理输出专家报告]

    tools --> loopCheck{{"工具调用次数 < 6?"}}
    loopCheck -->|"是"| agent
    loopCheck -->|"否（达上限强制终止）"| finalize

    finalize --> expEnd((END))
```

## HITL 流程（带 Checkpoint 的人机协同）

```mermaid
flowchart TD
    hitlStart(["用户提交需求"]) --> hitlExtract[📋 extractStep<br/>提取结构化需求]

    hitlExtract --> hitlPause["⏸️ interruptBefore<br/>在 clarifyStep 前暂停<br/>checkpoint 已保存 extracted 数据"]

    hitlPause --> userReview["👤 用户查看 extracted 结果<br/>决定是否补充信息"]

    userReview --> userDecision{{"用户操作?"}}

    userDecision -->|"补充澄清答案"| resume[▶️ resume<br/>updateState 写回 patch]
    userDecision -->|"取消"| hitlEnd([结束])

    resume --> hitlClarify[❓ clarifyStep<br/>基于补充信息重新判断]
    hitlClarify --> hitlRest["继续执行剩余流程<br/>analysis → risk → summary"]
    hitlRest --> hitlDone([SSE 推送最终报告])
```

## 工具分配总览

```mermaid
flowchart LR
    subgraph functional["功能专家"]
        f1[🔧 search_requirement<br/>查询需求详情]
        f2[🔧 check_conflicts<br/>冲突检测]
        f3[🔧 read_feature_spec<br/>读取功能规范]
    end

    subgraph performance["性能专家"]
        p1[🔧 load_perf_baseline<br/>加载性能基线]
        p2[🔧 check_perf_budget<br/>检查性能预算]
    end

    subgraph security["安全专家"]
        s1[🔧 check_security_policy<br/>安全策略检查]
        s2[🔧 list_auth_scenarios<br/>列出认证场景]
    end

    subgraph compliance["合规专家"]
        c1[🔧 check_compliance_matrix<br/>合规矩阵检查]
        c2[🔧 check_data_residency<br/>数据驻留检查]
        c3[🔧 check_retention_policy<br/>数据保留策略]
    end
```

## 文件索引

| 组件 | 文件路径 |
|------|----------|
| 主图定义 + HITL | `services/chat/src/llm/graph/requirement-analysis-graph.ts` |
| 专家子图 + Supervisor | `services/chat/src/llm/graph/experts.ts` |
| 功能/冲突工具（2个） | `services/chat/src/llm/tools/analysis-tools.ts` |
| 专家工具（8个） | `services/chat/src/llm/tools/expert-tools.ts` |
| 编排入口 | `services/chat/src/llm/agents/orchestrator.service.ts` |
| SSE 推送端点 | `services/chat/src/conversation/conversation.controller.ts` |
| Plan-and-Execute 流水线 | `services/chat/src/llm/graph/pipeline.ts` |
