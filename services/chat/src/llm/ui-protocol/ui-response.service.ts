import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { aiUIResponseSchema, type AIUIResponse } from './ui-schemas';

const SYSTEM_PROMPT = `你是一个需求分析系统的智能助手。根据对话上下文和用户输入，返回自然语言回复和配套的 UI 组件。

## 输出格式（严格遵守）

你必须返回一个 JSON 对象：
{"message": "自然语言回复", "components": [...]}

## 组件类型

### text — 纯文本/Markdown
{"type": "text", "content": "Markdown 文本"}

### selection — 选项卡片
{"type": "selection", "title": "请选择", "options": [{"label": "功能需求", "value": "feature", "description": "新增功能"}], "allowMultiple": false}

### form — 动态表单
{"type": "form", "title": "新需求", "fields": [{"name": "title", "label": "标题", "fieldType": "input", "required": true, "placeholder": "请输入"}], "submitLabel": "提交"}

### confirmation — 确认对话框
{"type": "confirmation", "title": "确认删除", "summary": "此操作不可撤销", "confirmLabel": "确认", "severity": "danger"}

### card — 信息卡片
{"type": "card", "title": "需求详情", "sections": [{"label": "编号", "value": "REQ-001"}], "status": {"label": "进行中", "color": "blue"}}

### steps — 步骤进度条
{"type": "steps", "steps": [{"label": "提交", "status": "completed"}, {"label": "评审", "status": "current"}, {"label": "开发", "status": "pending"}]}

### table — 数据表格
{"type": "table", "columns": [{"key": "id", "label": "编号"}], "rows": [{"id": "REQ-001", "title": "示例需求"}]}

### action_buttons — 操作按钮组
{"type": "action_buttons", "buttons": [{"label": "编辑", "value": "edit", "style": "primary"}, {"label": "删除", "value": "delete", "style": "danger"}]}

## 场景指南
- 提新需求 → form（需求登记表）
- 选择类型/优先级 → selection
- 查看详情 → card
- 确认操作 → confirmation
- 展示流程 → steps
- 列表数据 → table
- 快捷操作 → action_buttons
- 普通对话 → text

## 规则
1. 必须返回合法 JSON，不要输出其他内容
2. message 始终要有
3. components 按需 0-3 个
4. 不确定时只用 text`;

@Injectable()
export class UIResponseService implements OnModuleInit {
  private readonly logger = new Logger(UIResponseService.name);
  private model!: ChatOpenAI;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.model = new ChatOpenAI({
      model: this.config.get('LLM_MODEL') || 'deepseek-v4-pro',
      temperature: 0.7,
      maxTokens: 2048,
      apiKey: this.config.get('OPENAI_API_KEY'),
      configuration: this.config.get('OPENAI_BASE_URL')
        ? { baseURL: this.config.get('OPENAI_BASE_URL') }
        : undefined,
    });
  }

  private extractJson(content: string): unknown {
    // Try ```json ... ``` block first
    const block = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (block) {
      return JSON.parse(block[1]);
    }
    // Try raw JSON
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
    throw new Error(`Response is not JSON: ${content.slice(0, 200)}`);
  }

  async generateUIResponse(
    input: string,
    history?: BaseMessage[],
    context?: string,
  ): Promise<AIUIResponse> {
    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
    ];

    if (context) {
      messages.push(new SystemMessage(`当前上下文：\n${context}`));
    }

    if (history) {
      messages.push(...history);
    }

    messages.push(new HumanMessage(input));

    const result = await this.model.invoke(messages);
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    this.logger.log(`Raw response: ${text.slice(0, 300)}`);

    const parsed = this.extractJson(text);
    return aiUIResponseSchema.parse(parsed) as AIUIResponse;
  }

  async handleAction(
    action: { type: string; payload?: Record<string, unknown> },
    sessionContext?: string,
  ): Promise<AIUIResponse> {
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

    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      new SystemMessage(`用户执行了 UI 操作：${actionDesc}。根据此操作生成下一步回复。${sessionContext ? `\n上下文：${sessionContext}` : ''}`),
      new HumanMessage(actionDesc),
    ];

    const result = await this.model.invoke(messages);
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    const parsed = this.extractJson(text);
    return aiUIResponseSchema.parse(parsed) as AIUIResponse;
  }
}
