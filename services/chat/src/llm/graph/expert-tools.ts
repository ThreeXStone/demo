/**
 * 专家工具集：为功能、性能、安全、合规四类专家提供专用工具
 * 当前为 Mock 实现，后续接入真实数据源
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// ============================================================================
// 共享工具
// ============================================================================

export const searchRequirementTool = tool(
  (input) => {
    const { reqId } = input as { reqId: string };
    console.log(`[LangGraph] searchRequirement called with reqId: ${reqId}`);
    return JSON.stringify({
      reqId,
      title: '示例需求：用户认证模块',
      type: 'functional',
      priority: 'P1',
      description: '实现基于JWT的用户登录、注册、密码重置功能',
      acceptanceCriteria: '用户可通过邮箱注册并登录；密码至少8位含大小写字母和数字；支持密码重置',
      status: 'reviewing',
      dependencies: ['邮件服务', '短信网关'],
    });
  },
  {
    name: 'search_requirement',
    description: '根据需求编号查询需求详情。输入 reqId（如 REQ-001），返回需求的完整信息。',
    schema: z.object({
      reqId: z.string().describe('需求编号，如 REQ-001'),
    }),
  },
);

// ============================================================================
// 功能专家工具
// ============================================================================

export const checkConflictsTool = tool(
  async ({ description }: { description: string }) => {
    const descLower = description.toLowerCase();

    if ((descLower.includes('登录') || descLower.includes('认证') || descLower.includes('auth')) &&
        (descLower.includes('jwt') || descLower.includes('session') || descLower.includes('token'))) {
      return `检测到潜在冲突：
- 与已有需求 REQ-20240310-005（OAuth 认证系统）存在功能重叠
- 冲突类型：认证方案冲突
- 建议解决方案：统一认证方案，避免维护两套系统；如需支持多种认证方式，采用认证策略模式`;
    }

    if (descLower.includes('统计') || descLower.includes('报表') || descLower.includes('数据分析')) {
      return `检测到潜在依赖：
- 需求可能依赖现有的数据统计模块
- 建议：确认与数据统计模块的接口兼容性`;
    }

    return `未检测到明显冲突。需求可以正常推进。建议在实施前确认与相关模块的接口兼容性。`;
  },
  {
    name: 'check_conflicts',
    description: '检测需求是否与现有功能存在冲突或重叠。输入功能描述，返回冲突检测结果和建议。',
    schema: z.object({
      description: z.string().describe('需求的功能描述，用于分析潜在冲突'),
    }),
  },
);

export const readFeatureSpecTool = tool(
  async ({ module }: { module: string }) => {
    const mockSpecs: Record<string, any> = {
      '用户管理': {
        module: '用户管理',
        version: 'v2.3.0',
        features: ['用户注册', '登录验证', '权限管理', '密码重置'],
        apis: ['POST /api/users/register', 'POST /api/users/login', 'GET /api/users/profile'],
        dependencies: ['认证服务', '邮件服务'],
        constraints: ['需支持 OAuth 2.0', '密码必须加密存储'],
      },
      '数据统计': {
        module: '数据统计',
        version: 'v1.5.0',
        features: ['实时统计', '报表生成', '数据导出', '图表展示'],
        apis: ['GET /api/stats/realtime', 'POST /api/stats/report'],
        dependencies: ['数据仓库', 'Redis缓存'],
        constraints: ['查询响应时间 < 3秒', '支持百万级数据量'],
      },
    };

    const spec = mockSpecs[module];
    if (!spec) {
      return `模块 "${module}" 的功能规范未找到。可用模块：${Object.keys(mockSpecs).join('、')}`;
    }

    return `模块 "${module}" 功能规范：
版本：${spec.version}
核心功能：${spec.features.join('、')}
API 接口：${spec.apis.map((api: string) => `  - ${api}`).join('\n')}
依赖项：${spec.dependencies.join('、')}
约束条件：${spec.constraints.join('；')}`;
  },
  {
    name: 'read_feature_spec',
    description: '读取功能模块的详细规范文档。参数 module 为模块名称（如"用户管理"、"数据统计"）。',
    schema: z.object({
      module: z.string().describe('功能模块名称，如"用户管理"、"数据统计"'),
    }),
  },
);

// ============================================================================
// 性能专家工具
// ============================================================================

export const loadPerfBaselineTool = tool(
  async ({ service }: { service: string }) => {
    const mockBaselines: Record<string, any> = {
      'api-gateway': {
        service: 'api-gateway',
        avgResponseTime: '45ms',
        p95ResponseTime: '120ms',
        p99ResponseTime: '350ms',
        throughput: '5000 req/s',
        errorRate: '0.05%',
        cpuUsage: '35%',
        memoryUsage: '1.2GB / 4GB',
      },
      'database': {
        service: 'database',
        avgQueryTime: '8ms',
        p95QueryTime: '25ms',
        p99QueryTime: '80ms',
        connections: '120 / 500',
        cacheHitRate: '92%',
      },
    };

    const baseline = mockBaselines[service];
    if (!baseline) {
      return `服务 "${service}" 的性能基线未找到。可用服务：${Object.keys(mockBaselines).join('、')}`;
    }

    return `服务 "${service}" 性能基线：
平均响应时间：${baseline.avgResponseTime || baseline.avgQueryTime}
P95 响应时间：${baseline.p95ResponseTime || baseline.p95QueryTime}
P99 响应时间：${baseline.p99ResponseTime || baseline.p99QueryTime}
${baseline.throughput ? `吞吐量：${baseline.throughput}` : ''}
${baseline.errorRate ? `错误率：${baseline.errorRate}` : ''}
${baseline.cpuUsage ? `CPU 使用率：${baseline.cpuUsage}` : ''}
${baseline.memoryUsage ? `内存使用：${baseline.memoryUsage}` : ''}`;
  },
  {
    name: 'load_perf_baseline',
    description: '加载服务的性能基线数据，包括响应时间、吞吐量、资源使用等指标。',
    schema: z.object({
      service: z.string().describe('服务名称，如"api-gateway"、"database"'),
    }),
  },
);

export const checkPerfBudgetTool = tool(
  async ({ estimatedLoad }: { estimatedLoad: string }) => {
    const loadLower = estimatedLoad.toLowerCase();

    if (loadLower.includes('大文件') || loadLower.includes('批量') || loadLower.includes('导入')) {
      return `性能预算评估：
⚠️ 预计影响：高
- CPU 使用：+15-25%（文件解析）
- 内存使用：+500MB-1GB（数据缓存）
- 磁盘 I/O：峰值可能超过当前容量 2-3 倍
建议措施：使用异步队列处理；增加文件大小限制（建议 50MB 以内）；分批写入数据库`;
    }

    if (loadLower.includes('实时') || loadLower.includes('推送') || loadLower.includes('websocket')) {
      return `性能预算评估：
⚠️ 预计影响：中高
- WebSocket 连接：+1000-5000 并发
- 内存使用：+200MB-500MB（连接池）
- 网络带宽：+50-100Mbps
建议措施：使用 Redis Pub/Sub；设置连接超时和心跳检测`;
    }

    return `性能预算评估：
✓ 预计影响：低
- 预计增加：平均响应时间 +5-15ms，数据库查询 +1-3 次/请求
建议：正常推进，上线后监控关键指标`;
  },
  {
    name: 'check_perf_budget',
    description: '检查新需求是否超出性能预算，评估对系统资源的影响。',
    schema: z.object({
      estimatedLoad: z.string().describe('预估负载描述，如"大文件上传"、"实时推送"、"批量导入"'),
    }),
  },
);

// ============================================================================
// 安全专家工具
// ============================================================================

export const checkSecurityPolicyTool = tool(
  async ({ description }: { description: string }) => {
    const descLower = description.toLowerCase();
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (descLower.includes('登录') || descLower.includes('认证') || descLower.includes('密码')) {
      issues.push('涉及用户认证功能');
      recommendations.push('必须使用 HTTPS 加密传输');
      recommendations.push('密码必须使用 bcrypt 或 Argon2 加密存储');
      recommendations.push('实施密码强度策略：至少 8 位，包含大小写、数字和特殊字符');
      recommendations.push('登录失败 5 次后锁定账户 15 分钟');
    }

    if (descLower.includes('查询') || descLower.includes('数据') || descLower.includes('导出')) {
      issues.push('涉及数据访问和查询');
      recommendations.push('必须验证用户权限，遵循最小权限原则');
      recommendations.push('使用参数化查询，防止 SQL 注入');
      recommendations.push('敏感数据（手机号、身份证）需脱敏展示');
    }

    if (descLower.includes('上传') || descLower.includes('文件') || descLower.includes('导入')) {
      issues.push('涉及文件上传功能');
      recommendations.push('限制文件类型（白名单）和大小');
      recommendations.push('文件上传后需病毒扫描');
      recommendations.push('使用随机文件名存储，防止路径遍历攻击');
    }

    if (issues.length === 0) {
      return `安全策略检查：✓ 未发现明显安全风险。建议遵循 OWASP Top 10 安全实践。`;
    }

    return `安全策略检查：
⚠️ 发现安全关注点：
${issues.map(i => `- ${i}`).join('\n')}

安全要求：
${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  },
  {
    name: 'check_security_policy',
    description: '检查需求是否符合安全策略和规范，识别潜在安全风险。',
    schema: z.object({
      description: z.string().describe('需求功能描述'),
    }),
  },
);

export const listAuthScenariosTool = tool(
  async () => {
    return `当前系统支持的认证场景：

1. 用户名密码登录
   - 支持范围：Web 端、移动端
   - 认证方式：bcrypt 密码哈希 + JWT token
   - Token 有效期：2 小时（可刷新）

2. OAuth 第三方登录
   - 支持平台：Google、GitHub、微信
   - 实现标准：OAuth 2.0

3. API Key 认证（仅限服务端）
   - 使用场景：服务间调用、开放平台
   - 权限控制：基于 Scope

安全策略：
- 所有认证接口启用速率限制
- 登录失败记录日志并触发告警
- 支持强制登出和会话撤销`;
  },
  {
    name: 'list_auth_scenarios',
    description: '列出系统当前支持的所有认证方式和场景。',
    schema: z.object({}),
  },
);

// ============================================================================
// 合规专家工具
// ============================================================================

export const checkComplianceMatrixTool = tool(
  async ({ industry, dataType }: { industry: string; dataType: string }) => {
    const dataTypeLower = dataType.toLowerCase();
    const issues: string[] = [];
    const requirements: string[] = [];

    if (dataTypeLower.includes('个人') || dataTypeLower.includes('用户') || dataTypeLower.includes('隐私')) {
      issues.push('涉及个人信息处理');
      requirements.push('《个人信息保护法》：获得用户明确同意，说明收集目的和范围');
      requirements.push('最小化原则：只收集必要的个人信息');
      requirements.push('用户权利：支持用户查询、更正、删除个人信息');
    }

    if (dataTypeLower.includes('身份证') || dataTypeLower.includes('手机') || dataTypeLower.includes('地址')) {
      issues.push('涉及敏感个人信息');
      requirements.push('需获得用户单独同意');
      requirements.push('传输和存储必须加密');
      requirements.push('展示时必须脱敏（如手机号 138****1234）');
    }

    if (industry.toLowerCase().includes('金融') || industry.toLowerCase().includes('支付')) {
      issues.push('金融行业特殊要求');
      requirements.push('遵循《网络安全法》第三级等保要求');
      requirements.push('实名认证：支付账户必须实名制');
    }

    if (issues.length === 0) {
      return `合规检查：✓ 基础合规要求。遵循《网络安全法》基本规范。建议咨询法务确认具体行业要求。`;
    }

    return `合规矩阵检查（行业：${industry}）：
⚠️ 合规关注点：
${issues.map(i => `- ${i}`).join('\n')}

合规要求：
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  },
  {
    name: 'check_compliance_matrix',
    description: '检查需求是否符合行业合规要求（如个人信息保护法、行业监管政策）。',
    schema: z.object({
      industry: z.string().describe('所属行业，如"互联网"、"金融"、"医疗"'),
      dataType: z.string().describe('涉及的数据类型，如"用户个人信息"、"交易数据"'),
    }),
  },
);

export const checkDataResidencyTool = tool(
  async ({ dataType, userRegion }: { dataType: string; userRegion: string }) => {
    const regionLower = userRegion.toLowerCase();

    if (regionLower.includes('中国') || regionLower.includes('国内')) {
      return `数据驻留检查：
⚠️ 数据本地化要求
- 《网络安全法》第 37 条：关键信息基础设施运营者在中国境内收集的个人信息必须在境内存储
- 《个人信息保护法》第 40 条：个人信息原则上应在境内存储
建议：使用国内云服务，数据不出境。`;
    }

    if (regionLower.includes('欧洲') || regionLower.includes('eu')) {
      return `数据驻留检查：
⚠️ GDPR 要求
- 欧盟用户数据必须在欧盟境内处理或传输至"充分性认定"国家/地区
- 用户享有"被遗忘权"
建议：使用 AWS eu-west-1 区域，签署标准合同条款（SCC）。`;
    }

    return `数据驻留检查：✓ 常规数据存储。建议使用距离用户最近的云区域优化性能。`;
  },
  {
    name: 'check_data_residency',
    description: '检查数据存储位置是否符合数据驻留和跨境传输的合规要求。',
    schema: z.object({
      dataType: z.string().describe('数据类型，如"用户个人信息"、"业务数据"'),
      userRegion: z.string().describe('用户所在地区，如"中国"、"欧洲"'),
    }),
  },
);

export const checkRetentionPolicyTool = tool(
  async ({ dataType }: { dataType: string }) => {
    const dataTypeLower = dataType.toLowerCase();

    if (dataTypeLower.includes('日志') || dataTypeLower.includes('审计')) {
      return `数据保留策略检查：
📋 审计日志保留要求
- 《网络安全法》：网络日志至少保存 6 个月
- 等保三级：审计日志保存 1 年以上
建议：访问日志保留 1 年，操作日志保留 2 年，安全事件日志保留 3 年。`;
    }

    if (dataTypeLower.includes('个人') || dataTypeLower.includes('用户')) {
      return `数据保留策略检查：
📋 个人信息保留要求
- 《个人信息保护法》：达到处理目的后应删除或匿名化
建议：活跃用户数据保留至账户存续期间；注销后 30 天冷静期后删除或匿名化。`;
    }

    return `数据保留策略检查：
📋 通用建议：业务数据保留 1-3 年，系统日志保留 6 个月-1 年，临时数据保留 7-30 天。`;
  },
  {
    name: 'check_retention_policy',
    description: '检查数据保留时长是否符合合规要求（如日志保存、个人信息删除）。',
    schema: z.object({
      dataType: z.string().describe('数据类型，如"审计日志"、"用户个人信息"、"交易记录"'),
    }),
  },
);

// ============================================================================
// 工具分组导出
// ============================================================================

export const functionalExpertTools = [searchRequirementTool, checkConflictsTool, readFeatureSpecTool];
export const performanceExpertTools = [loadPerfBaselineTool, checkPerfBudgetTool];
export const securityExpertTools = [checkSecurityPolicyTool, listAuthScenariosTool];
export const complianceExpertTools = [checkComplianceMatrixTool, checkDataResidencyTool, checkRetentionPolicyTool];
