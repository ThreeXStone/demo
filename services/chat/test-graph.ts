import { ChatOpenAI } from '@langchain/openai';
import { runAnalysisGraph, type RunAnalysisGraphOutput } from './src/llm/graph/requirement-analysis-graph';

const model = new ChatOpenAI({
  model: 'deepseek-v4-pro',
  temperature: 0.3,
  maxTokens: 2048,
  apiKey: 'sk-38c315d874b442cca2ac5db8aa7cadcb',
  configuration: { baseURL: 'https://api.deepseek.com/v1' },
});

interface TestCase {
  name: string;
  input: string;
  expectedIntent: 'analyze' | 'query' | 'chat';
  checks: (r: RunAnalysisGraphOutput) => { pass: boolean; reason: string }[];
}

const cases: TestCase[] = [
  {
    name: 'Case 1: 完整需求分析',
    input: '分析需求 REQ-20240315-001：开发在线问卷系统，支持多种题型、自动评分和数据导出功能',
    expectedIntent: 'analyze',
    checks: [
      (r) => ({ pass: r.intent === 'analyze', reason: `intent=${r.intent}` }),
      (r) => ({ pass: !!r.summary && r.summary.length > 50, reason: `summary length=${r.summary?.length || 0}` }),
      (r) => ({ pass: !!r.analysisResult && r.analysisResult.length > 20, reason: 'analysisResult non-empty' }),
      (r) => ({ pass: !!r.riskResult && r.riskResult.length > 20, reason: 'riskResult non-empty' }),
      (r) => ({ pass: Object.keys(r.extracted || {}).length > 0, reason: 'extracted non-empty' }),
    ],
  },
  {
    name: 'Case 2: 需求状态查询',
    input: '查询 REQ-20240315-001 的当前状态',
    expectedIntent: 'query',
    checks: [
      (r) => ({ pass: r.intent === 'query', reason: `intent=${r.intent}` }),
      (r) => ({ pass: !!r.queryResponse && r.queryResponse.length > 10, reason: `queryResponse length=${r.queryResponse?.length || 0}` }),
      (r) => ({ pass: r.analysisResult === undefined, reason: 'analysisResult should be undefined' }),
      (r) => ({ pass: r.extracted === undefined, reason: 'extracted should be undefined' }),
    ],
  },
  {
    name: 'Case 3: 普通闲聊',
    input: '你好，今天天气不错',
    expectedIntent: 'chat',
    checks: [
      (r) => ({ pass: r.intent === 'chat', reason: `intent=${r.intent}` }),
      (r) => ({ pass: !!r.chatResponse && r.chatResponse.length > 5, reason: `chatResponse length=${r.chatResponse?.length || 0}` }),
      (r) => ({ pass: r.analysisResult === undefined, reason: 'analysis nodes not triggered' }),
    ],
  },
  {
    name: 'Case 4: 模糊意图',
    input: '看看 REQ-20240315-001 有没有什么问题',
    expectedIntent: 'query',
    checks: [
      (r) => ({ pass: r.intent === 'query' || r.intent === 'analyze', reason: `intent=${r.intent} (expected query or analyze)` }),
      (r) => ({ pass: !!r.summary && r.summary.length > 10, reason: 'got some response' }),
    ],
  },
  {
    name: 'Case 5: 带编号的查询',
    input: 'REQ-20240415-002 的进度如何',
    expectedIntent: 'query',
    checks: [
      (r) => ({ pass: r.intent === 'query', reason: `intent=${r.intent} (REQ number → query priority)` }),
    ],
  },
  {
    name: 'Case 6: 简短需求',
    input: '我需要一个用户登录功能',
    expectedIntent: 'analyze',
    checks: [
      (r) => ({ pass: r.intent === 'analyze', reason: `intent=${r.intent}` }),
      (r) => ({ pass: !!r.summary && r.summary.length > 20, reason: `summary length=${r.summary?.length || 0}` }),
    ],
  },
  {
    name: 'Case 7: 多重含义',
    input: '查询 REQ-20240315-001 的风险分析报告',
    expectedIntent: 'query',
    checks: [
      (r) => ({ pass: r.intent === 'query', reason: `intent=${r.intent} ("查询" > "分析")` }),
    ],
  },
];

async function run() {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  for (const tc of cases) {
    const start = Date.now();
    let result: RunAnalysisGraphOutput;
    try {
      result = await runAnalysisGraph({
        input: tc.input,
        retrievedContext: '',
        model,
      });
    } catch (err) {
      results.push(`❌ ${tc.name}: threw ${(err as Error).message}`);
      failed++;
      continue;
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const checkResults = tc.checks.map((c) => c(result));
    const allPass = checkResults.every((c) => c.pass);

    if (allPass) {
      passed++;
      results.push(`✅ ${tc.name} (${elapsed}s) intent=${result.intent}`);
    } else {
      failed++;
      const fails = checkResults.filter((c) => !c.pass).map((c) => c.reason);
      results.push(`❌ ${tc.name} (${elapsed}s) intent=${result.intent} | failures: ${fails.join('; ')}`);
    }

    // show step details for debug
    if (!allPass) {
      console.log(`\n--- ${tc.name} debug ---`);
      console.log('input:', tc.input.slice(0, 80));
      console.log('intent:', result.intent);
      console.log('steps:', Object.keys(result.steps).join(' → '));
      console.log('summary:', result.summary?.slice(0, 150));
      console.log('queryResponse:', result.queryResponse?.slice(0, 100));
      console.log('chatResponse:', result.chatResponse?.slice(0, 100));
    }
  }

  console.log('\n========================================');
  results.forEach((r) => console.log(r));
  console.log('========================================');
  console.log(`Total: ${cases.length} | ✅ ${passed} | ❌ ${failed}`);
  const accuracy = ((passed / cases.length) * 100).toFixed(0);
  console.log(`Accuracy: ${accuracy}% ${+accuracy >= 85 ? '✅ PASS' : '❌ FAIL (target ≥85%)'}`);
}

run().catch((e) => console.error('FATAL:', e.message));
