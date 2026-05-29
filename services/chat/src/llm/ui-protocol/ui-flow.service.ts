import { Injectable } from '@nestjs/common';
import type { AIUIResponse } from './ui-schemas';

interface SessionContext {
  stage: string;
  collectedData: Record<string, unknown>;
}

@Injectable()
export class UIFlowService {
  private sessions = new Map<string, SessionContext>();

  private getContext(sessionId: string): SessionContext {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { stage: 'init', collectedData: {} });
    }
    return this.sessions.get(sessionId)!;
  }

  // ====== Input Handler ======

  handleInput(sessionId: string, input: string): AIUIResponse {
    const ctx = this.getContext(sessionId);

    if (input.includes('需求') || input.includes('功能') || input.includes('优化')) {
      ctx.collectedData.rawInput = input;
      ctx.stage = 'select_type';
      return this.buildSelectType(ctx);
    }

    return {
      message: '请问有什么可以帮您？',
      components: [
        {
          type: 'action_buttons',
          title: '常用功能',
          buttons: [
            { label: '提交新需求', value: 'new_req', style: 'primary' },
            { label: '查看需求列表', value: 'view_reqs', style: 'secondary' },
            { label: '搜索相似需求', value: 'search', style: 'secondary' },
          ],
        },
      ],
    };
  }

  // ====== Action Handler ======

  handleAction(
    sessionId: string,
    action: { componentType?: string; payload?: Record<string, unknown> },
  ): AIUIResponse {
    const ctx = this.getContext(sessionId);
    const payload = action.payload || {};
    const type = payload.type as string;

    if (type === 'cancel') {
      return this.goBack(ctx);
    }

    switch (ctx.stage) {
      case 'select_type':
        return this.onTypeSelected(ctx, payload);
      case 'fill_detail':
        return this.onFormSubmitted(ctx, payload);
      case 'confirm':
        return this.onConfirmation(ctx, payload);
      default:
        return this.onButtonAction(ctx, payload);
    }
  }

  // ====== Stage: Select Type ======

  private buildSelectType(ctx: SessionContext): AIUIResponse {
    const desc = ctx.collectedData.rawInput
      ? `您提到：${ctx.collectedData.rawInput}`
      : '';

    return {
      message: `${desc}\n请选择需求类型，以便匹配合适的分析模板。`,
      components: [
        {
          type: 'selection',
          title: '请选择需求类型',
          options: [
            {
              label: '功能需求',
              value: 'functional',
              description: '新增或修改系统功能',
            },
            {
              label: '性能需求',
              value: 'performance',
              description: '响应时间、并发量、吞吐率等指标',
            },
            {
              label: '安全需求',
              value: 'security',
              description: '权限控制、数据加密、审计日志等',
            },
            {
              label: 'UI/UX 需求',
              value: 'ui_ux',
              description: '界面交互、用户体验优化',
            },
          ],
          allowMultiple: false,
        },
      ],
    };
  }

  private onTypeSelected(
    ctx: SessionContext,
    payload: Record<string, unknown>,
  ): AIUIResponse {
    if (payload.type !== 'select') {
      return this.buildSelectType(ctx);
    }
    ctx.collectedData.reqType = payload.selectedId || payload.value;
    ctx.stage = 'fill_detail';
    return this.buildDetailForm(ctx);
  }

  // ====== Stage: Fill Detail ======

  private buildDetailForm(ctx: SessionContext): AIUIResponse {
    const typeLabel: Record<string, string> = {
      functional: '功能需求',
      performance: '性能需求',
      security: '安全需求',
      ui_ux: 'UI/UX 需求',
    };
    const selected = (ctx.collectedData.reqType as string) || 'functional';

    return {
      message: `已选择：${typeLabel[selected] || selected}。请填写需求详情。`,
      components: [
        {
          type: 'form',
          title: '需求详情',
          fields: [
            {
              name: 'title',
              label: '需求标题',
              fieldType: 'input',
              required: true,
              placeholder: '请输入需求标题',
            },
            {
              name: 'description',
              label: '需求描述',
              fieldType: 'textarea',
              required: true,
              placeholder: '请详细描述需求背景、目标和预期效果',
            },
            {
              name: 'priority',
              label: '优先级',
              fieldType: 'select',
              required: true,
              options: [
                { label: 'P0-紧急', value: 'P0' },
                { label: 'P1-高', value: 'P1' },
                { label: 'P2-中', value: 'P2' },
                { label: 'P3-低', value: 'P3' },
              ],
            },
            {
              name: 'acceptanceCriteria',
              label: '验收标准',
              fieldType: 'textarea',
              required: true,
              placeholder: '描述可量化的验收标准',
            },
            {
              name: 'notes',
              label: '补充说明',
              fieldType: 'textarea',
              required: false,
              placeholder: '其他需要说明的信息（选填）',
            },
          ],
          submitLabel: '提交需求',
        },
      ],
    };
  }

  private onFormSubmitted(
    ctx: SessionContext,
    payload: Record<string, unknown>,
  ): AIUIResponse {
    if (payload.type !== 'form_submit' && payload.type !== 'submit') {
      return this.buildDetailForm(ctx);
    }
    const formData = (payload.formData || payload.data || {}) as Record<string, unknown>;
    Object.assign(ctx.collectedData, formData);
    ctx.stage = 'confirm';
    return this.buildConfirmation(ctx);
  }

  // ====== Stage: Confirm ======

  private buildConfirmation(ctx: SessionContext): AIUIResponse {
    const d = ctx.collectedData;
    const summary = [
      `需求类型：${d.reqType || '-'}`,
      `标题：${d.title || '-'}`,
      `优先级：${d.priority || '-'}`,
      `描述：${(d.description as string)?.slice(0, 80) || '-'}`,
      `验收标准：${(d.acceptanceCriteria as string)?.slice(0, 80) || '-'}`,
    ].join('\n');

    return {
      message: '请确认以下需求信息，确认后将提交分析。',
      components: [
        {
          type: 'confirmation',
          title: '确认提交需求分析',
          summary,
          confirmLabel: '确认提交',
          cancelLabel: '返回修改',
          severity: 'info',
        },
        {
          type: 'card',
          title: '需求预览',
          sections: [
            { label: '类型', value: (d.reqType as string) || '-' },
            { label: '标题', value: (d.title as string) || '-' },
            { label: '优先级', value: (d.priority as string) || '-' },
            { label: '描述', value: (d.description as string)?.slice(0, 100) || '-' },
            {
              label: '验收标准',
              value: (d.acceptanceCriteria as string)?.slice(0, 100) || '-',
            },
          ],
        },
      ],
    };
  }

  private onConfirmation(
    ctx: SessionContext,
    payload: Record<string, unknown>,
  ): AIUIResponse {
    if (payload.type !== 'confirm') {
      return this.goBack(ctx);
    }
    if (payload.confirmed === false) {
      return this.goBack(ctx);
    }
    ctx.stage = 'result';
    return this.buildResult(ctx);
  }

  // ====== Stage: Result ======

  private buildResult(ctx: SessionContext): AIUIResponse {
    const reqId = `REQ-${Date.now().toString(36).toUpperCase()}`;
    ctx.collectedData.reqId = reqId;

    return {
      message: `需求 ${reqId} 已提交，分析流程已启动。`,
      components: [
        {
          type: 'steps',
          steps: [
            { label: '需求提交', status: 'completed' },
            { label: '需求评审', status: 'current' },
            { label: '方案设计', status: 'pending' },
            { label: '开发实现', status: 'pending' },
            { label: '测试验收', status: 'pending' },
          ],
        },
        {
          type: 'card',
          title: `需求摘要 — ${reqId}`,
          sections: [
            { label: '标题', value: (ctx.collectedData.title as string) || '-' },
            { label: '类型', value: (ctx.collectedData.reqType as string) || '-' },
            { label: '优先级', value: (ctx.collectedData.priority as string) || '-' },
            { label: '状态', value: '评审中' },
          ],
          status: { label: '进行中', color: 'blue' },
        },
        {
          type: 'action_buttons',
          title: '后续操作',
          buttons: [
            { label: '生成用户故事', value: 'gen_stories', style: 'primary' },
            { label: '查看分析报告', value: 'view_report', style: 'secondary' },
            { label: '提交新需求', value: 'new_req', style: 'secondary' },
          ],
        },
      ],
    };
  }

  // ====== Back ======

  private goBack(ctx: SessionContext): AIUIResponse {
    switch (ctx.stage) {
      case 'select_type':
        ctx.stage = 'init';
        return {
          message: '已取消。请问还有什么可以帮您？',
          components: [],
        };
      case 'fill_detail':
        ctx.stage = 'select_type';
        return this.buildSelectType(ctx);
      case 'confirm':
        ctx.stage = 'fill_detail';
        return this.buildDetailForm(ctx);
      default:
        return {
          message: '已返回。',
          components: [],
        };
    }
  }

  // ====== Button Actions ======

  private onButtonAction(
    ctx: SessionContext,
    payload: Record<string, unknown>,
  ): AIUIResponse {
    const value = (payload.selectedId || payload.value || payload.buttonValue) as string;

    if (value === 'new_req') {
      ctx.collectedData = {};
      ctx.stage = 'select_type';
      return this.buildSelectType(ctx);
    }

    if (value === 'gen_stories') {
      return {
        message: '已生成用户故事：\n\n1. 作为用户，我希望能...\n2. 作为管理员，我希望能...\n3. 作为系统，我希望能...',
        components: [
          {
            type: 'action_buttons',
            title: '操作',
            buttons: [
              { label: '查看分析报告', value: 'view_report', style: 'primary' },
              { label: '提交新需求', value: 'new_req', style: 'secondary' },
            ],
          },
        ],
      };
    }

    if (value === 'view_report') {
      return {
        message: `需求 ${ctx.collectedData.reqId || ''} 分析报告：\n\n## 可行性评估\n该需求技术可行，建议纳入下个迭代。\n\n## 风险评估\n低风险，已有类似功能可复用。\n\n## 预估工时\n5 人天`,
        components: [
          {
            type: 'action_buttons',
            title: '操作',
            buttons: [
              { label: '生成用户故事', value: 'gen_stories', style: 'primary' },
              { label: '提交新需求', value: 'new_req', style: 'secondary' },
            ],
          },
        ],
      };
    }

    return {
      message: '请选择操作。',
      components: [
        {
          type: 'action_buttons',
          title: '常用功能',
          buttons: [
            { label: '提交新需求', value: 'new_req', style: 'primary' },
            { label: '查看需求列表', value: 'view_reqs', style: 'secondary' },
          ],
        },
      ],
    };
  }
}
