import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { aiUIResponseSchema, type AIUIResponse } from './ui-schemas';
import type { BaseMessage } from '@langchain/core/messages';

const SYSTEM_PROMPT = `你是一个需求分析系统的智能助手。根据对话上下文和用户输入，返回自然语言回复和配套的 UI 组件。

## 组件使用指南

### text — 纯文本/Markdown 回复
普通对话、解释说明、分析结论。内容使用 Markdown 格式。

### selection — 选项卡片
用户需要从预定义选项中选择时使用。
- 选需求类型（功能需求/性能优化/缺陷修复）
- 选优先级、选模块
- mode: single 单选, multiple 多选

### form — 动态表单
需要用户填写结构化信息时使用。
- 新需求登记表、项目信息、配置参数
- 字段: input(文本), select(下拉), textarea(多行), date(日期), number(数字)

### confirmation — 确认对话框
执行重要操作前需用户确认。
- 提交需求分析、删除数据、发布上线
- severity: info/warning/danger

### card — 信息卡片
展示实体详情。
- 需求详情、任务信息、项目概览
- 可选 status: {label, color}

### steps — 步骤进度条
展示流程当前阶段。
- 需求分析流程: 需求提交→需求评审→方案设计→开发实现→测试验收
- 每个 step 有 completed/current/pending

### table — 数据表格
批量展示结构化数据。
- 需求列表、任务清单、对比表

### action_buttons — 操作按钮组
快捷操作入口。
- 查看详情/编辑/删除/导出
- style: primary/secondary/danger

## 规则
1. 始终返回 message（自然语言）
2. 根据需要返回 0-3 个 UI 组件
3. 不确定时只用 text
4. 组件内容必须与对话上下文一致`;

@Injectable()
export class UIResponseService implements OnModuleInit {
  private model!: ChatOpenAI;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get('OPENAI_API_KEY');
    const baseURL = this.config.get('OPENAI_BASE_URL');
    const model = this.config.get('LLM_MODEL') || 'gpt-4o-mini';

    this.model = new ChatOpenAI({
      model,
      temperature: 0.7,
      maxTokens: 2048,
      apiKey,
      configuration: baseURL ? { baseURL } : undefined,
    });
  }

  private getStructuredModel() {
    return this.model.withStructuredOutput(aiUIResponseSchema, {
      name: 'ui_response',
    });
  }

  async generateUIResponse(
    input: string,
    history?: BaseMessage[],
    context?: string,
  ): Promise<AIUIResponse> {
    const structured = this.getStructuredModel();

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `当前上下文信息：\n${context}`,
      });
    }

    if (history) {
      for (const msg of history) {
        const role = msg._getType();
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
        messages.push({
          role: role === 'human' ? 'user' : role === 'ai' ? 'assistant' : 'system',
          content,
        });
      }
    }

    messages.push({ role: 'user', content: input });

    const result = await structured.invoke(messages);
    return result as AIUIResponse;
  }

  async handleAction(
    action: { type: string; payload?: Record<string, unknown> },
    sessionContext?: string,
  ): Promise<AIUIResponse> {
    const structured = this.getStructuredModel();

    const actionDesc =
      action.type === 'select'
        ? `用户选择了: ${JSON.stringify(action.payload)}`
        : action.type === 'form_submit'
          ? `用户提交了表单: ${JSON.stringify(action.payload)}`
          : action.type === 'confirm'
            ? '用户点击了确认'
            : action.type === 'cancel'
              ? '用户点击了取消'
              : `用户点击了按钮: ${JSON.stringify(action.payload)}`;

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `用户执行了 UI 操作：${actionDesc}。请根据此操作生成下一步回复。${sessionContext ? `\n会话上下文：${sessionContext}` : ''}`,
      },
      { role: 'user', content: actionDesc },
    ];

    const result = await structured.invoke(messages);
    return result as AIUIResponse;
  }
}
