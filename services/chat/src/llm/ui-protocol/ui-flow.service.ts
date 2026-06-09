import { Injectable } from '@nestjs/common';
import type { AIUIResponse } from './ui-schemas';
import { validateUIResponse } from './ui-schemas';
import { RequirementService } from './requirement.service';

const V = '1.0.0';

function ok(msg: string, comps: AIUIResponse['components'] = []): AIUIResponse {
  return validateUIResponse({ version: V, message: msg, components: comps });
}

interface SessionContext { stage: string; collectedData: Record<string, unknown>; }

@Injectable()
export class UIFlowService {
  private sessions = new Map<string, SessionContext>();

  constructor(private readonly reqService: RequirementService) {}

  private getContext(sessionId: string): SessionContext {
    if (!this.sessions.has(sessionId))
      this.sessions.set(sessionId, { stage: 'init', collectedData: {} });
    return this.sessions.get(sessionId)!;
  }

  handleInput(sessionId: string, input: string): AIUIResponse {
    const ctx = this.getContext(sessionId);
    if (input.includes('需求') || input.includes('功能') || input.includes('优化')) {
      ctx.collectedData.rawInput = input;
      ctx.stage = 'fill_detail';
      return this.buildDetailForm(ctx);
    }
    return ok('你好！有什么可以帮你的吗？', [{
      type: 'action_buttons', title: '常用功能', buttons: [
        { label: '提交新需求', value: 'new_req', style: 'primary' },
        { label: '查看需求列表', value: 'view_reqs', style: 'secondary' },
      ],
    }]);
  }

  async handleAction(sessionId: string, action: { componentType?: string; payload?: Record<string, unknown> }): Promise<AIUIResponse> {
    const ctx = this.getContext(sessionId);
    const payload = action.payload || {};
    if ((payload.type as string) === 'cancel') return this.goBack(ctx);
    switch (ctx.stage) {
      case 'fill_detail': return this.onFormSubmitted(ctx, payload);
      case 'confirm': return this.onConfirmation(sessionId, ctx, payload);
      default: return this.onButtonAction(sessionId, ctx, payload);
    }
  }

  private buildDetailForm(ctx: SessionContext): AIUIResponse {
    return ok('请填写需求详情。', [{
      type: 'form', title: '需求详情', submitLabel: '提交需求', fields: [
        { name: 'title', label: '需求标题', fieldType: 'input', required: true, placeholder: '请输入需求标题', defaultValue: '新增管理员后台用户管理板块' },
        { name: 'description', label: '需求描述', fieldType: 'textarea', required: true, placeholder: '请详细描述需求背景、目标和预期效果', defaultValue: '在现有系统管理员后台中新增用户管理板块，支持对平台普通用户进行新增、查询、编辑、删除操作，需包含用户账号、昵称、角色、状态等核心字段的展示与编辑，同时保证操作日志可追溯，确保数据安全与操作合规。' },
        { name: 'priority', label: '优先级', fieldType: 'select', required: true, options: [{ label: 'P0-紧急', value: 'P0' }, { label: 'P1-高', value: 'P1' }, { label: 'P2-中', value: 'P2' }, { label: 'P3-低', value: 'P3' }], defaultValue: 'P2' },
        { name: 'acceptanceCriteria', label: '验收标准', fieldType: 'textarea', required: true, placeholder: '描述可量化的验收标准', defaultValue: '管理员可在后台看到完整的用户列表，支持按账号 / 昵称 / 角色进行模糊搜索，分页展示数据；\n可新增用户，填写账号、昵称、角色、初始密码等信息，系统校验字段合法性（如账号格式、密码强度）并提示错误；\n可编辑已有用户的昵称、角色、状态（启用 / 禁用），编辑后数据实时更新，且操作记录存入日志；\n可删除用户（支持单个 / 批量删除），删除前弹出二次确认弹窗，删除后数据不可恢复，同时记录删除操作人及时间；\n所有操作均需权限校验，仅具备 "用户管理" 权限的管理员可执行，无权限用户无法访问该板块。' },
        { name: 'notes', label: '补充说明', fieldType: 'textarea', required: false, placeholder: '其他需要说明的信息（选填）' },
      ],
    }]);
  }

  private onFormSubmitted(ctx: SessionContext, payload: Record<string, unknown>): AIUIResponse {
    if (payload.type !== 'form_submit' && payload.type !== 'submit') return this.buildDetailForm(ctx);
    Object.assign(ctx.collectedData, (payload.formData || payload.data || {}) as Record<string, unknown>);
    ctx.stage = 'confirm';
    return this.buildConfirmation(ctx);
  }

  private buildConfirmation(ctx: SessionContext): AIUIResponse {
    const d = ctx.collectedData;
    const summary = `标题：${d.title || '-'}\n优先级：${d.priority || '-'}\n描述：${(d.description as string)?.slice(0, 80) || '-'}\n验收标准：${(d.acceptanceCriteria as string)?.slice(0, 80) || '-'}`;
    return ok('请确认以下需求信息，确认后将提交分析。', [
      { type: 'confirmation', title: '确认提交需求分析', summary, confirmLabel: '确认提交', cancelLabel: '返回修改', severity: 'info' },
      { type: 'card', title: '需求预览', sections: [
        { label: '标题', value: (d.title as string) || '-' },
        { label: '优先级', value: (d.priority as string) || '-' }, { label: '描述', value: (d.description as string)?.slice(0, 100) || '-' },
        { label: '验收标准', value: (d.acceptanceCriteria as string)?.slice(0, 100) || '-' },
      ]},
    ]);
  }

  private async onConfirmation(sessionId: string, ctx: SessionContext, payload: Record<string, unknown>): Promise<AIUIResponse> {
    if (payload.type !== 'confirm' || payload.confirmed === false) return this.goBack(ctx);
    ctx.stage = 'result';

    const d = ctx.collectedData;
    const reqId = `REQ-${Date.now().toString(36).toUpperCase()}`;
    ctx.collectedData.reqId = reqId;

    // 持久化到数据库
    try {
      await this.reqService.create({
        sessionId,
        reqId,
        title: (d.title as string) || '',
        type: (d.reqType as string) || 'functional',
        priority: (d.priority as string) || 'P2',
        description: (d.description as string) || '',
        acceptanceCriteria: (d.acceptanceCriteria as string) || undefined,
        notes: (d.notes as string) || undefined,
      });
    } catch (e) {
      console.error('[UIFlow] 保存需求失败:', (e as Error).message);
    }

    return this.buildResult(ctx);
  }

  private buildResult(ctx: SessionContext): AIUIResponse {
    const reqId = (ctx.collectedData.reqId as string) || '';
    return ok(`需求 ${reqId} 已提交，分析流程已启动。`, [
      { type: 'steps', steps: [
        { label: '需求提交', status: 'completed' }, { label: '需求评审', status: 'current' },
        { label: '方案设计', status: 'pending' }, { label: '开发实现', status: 'pending' }, { label: '测试验收', status: 'pending' },
      ]},
      { type: 'card', title: `需求摘要 — ${reqId}`, sections: [
        { label: '标题', value: (ctx.collectedData.title as string) || '-' },
        { label: '优先级', value: (ctx.collectedData.priority as string) || '-' }, { label: '状态', value: '评审中' },
      ], status: { label: '进行中', color: 'blue' }},
    ]);
  }

  private goBack(ctx: SessionContext): AIUIResponse {
    switch (ctx.stage) {
      case 'fill_detail': ctx.stage = 'init'; return ok('已取消。请问还有什么可以帮您？');
      case 'confirm': ctx.stage = 'fill_detail'; return this.buildDetailForm(ctx);
      default: return ok('已返回。');
    }
  }

  private async onButtonAction(sessionId: string, ctx: SessionContext, payload: Record<string, unknown>): Promise<AIUIResponse> {
    const val = (payload.selectedId || payload.value || payload.buttonValue) as string;
    if (val === 'new_req') { ctx.collectedData = {}; ctx.stage = 'fill_detail'; return this.buildDetailForm(ctx); }
    if (val === 'view_reqs') {
      const reqs = await this.reqService.findBySession(sessionId);
      if (reqs.length === 0) return ok('暂无已提交的需求记录。', [
        { type: 'action_buttons', title: '操作', buttons: [{ label: '提交新需求', value: 'new_req', style: 'primary' }] },
      ]);
      const list = reqs.map((r: any) => `- **${r.reqId}** ${r.title} [${r.priority}] ${r.status}`).join('\n');
      return ok(`共 ${reqs.length} 条需求：\n\n${list}`, [
        { type: 'action_buttons', title: '操作', buttons: [
          { label: '提交新需求', value: 'new_req', style: 'primary' },
          { label: '查看需求列表', value: 'view_reqs', style: 'secondary' },
        ]},
      ]);
    }
    if (val === 'view_report') {
      const reqId = (ctx.collectedData.reqId as string) || '';
      let report = `需求 ${reqId} 分析报告：\n\n## 可行性评估\n该需求技术可行，建议纳入下个迭代。\n\n## 风险评估\n低风险，已有类似功能可复用。\n\n## 预估工时\n5 人天`;
      // 尝试从数据库查最新需求
      if (!reqId) {
        const reqs = await this.reqService.findBySession(sessionId);
        if (reqs.length > 0) {
          const latest = reqs[0];
          report = `需求 ${latest.reqId} 分析报告：\n\n## 可行性评估\n该需求技术可行，建议纳入下个迭代。\n\n## 风险评估\n低风险，已有类似功能可复用。\n\n## 预估工时\n5 人天`;
        }
      }
      return ok(report, [
        { type: 'action_buttons', title: '操作', buttons: [{ label: '提交新需求', value: 'new_req', style: 'primary' }] },
      ]);
    }
    return ok('请选择操作。', [
      { type: 'action_buttons', title: '常用功能', buttons: [{ label: '提交新需求', value: 'new_req', style: 'primary' }, { label: '查看需求列表', value: 'view_reqs', style: 'secondary' }] },
    ]);
  }
}
