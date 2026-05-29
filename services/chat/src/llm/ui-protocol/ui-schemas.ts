import { z } from 'zod';

// OpenAI structured output: no $ref, no oneOf, no optional — all fields required.

export const uiComponentSchema = z.object({
  type: z
    .enum([
      'text',
      'selection',
      'form',
      'confirmation',
      'card',
      'steps',
      'table',
      'action_buttons',
    ])
    .describe('UI 组件类型标识'),

  content: z.string().describe('text: Markdown 文本内容'),
  title: z.string().describe('selection/form/card/confirmation/table/steps: 标题'),
  mode: z.string().describe("selection: 'single' 或 'multiple'"),
  options: z
    .array(
      z.object({
        label: z.string().describe('选项显示文字'),
        value: z.string().describe('选项值'),
        description: z.string().describe('选项补充说明'),
      }),
    )
    .describe('selection: 选项列表'),

  fields: z
    .array(
      z.object({
        name: z.string().describe('字段标识名'),
        label: z.string().describe('字段标签'),
        type: z.string().describe("字段类型: 'input','select','textarea','date','number'"),
        required: z.boolean().describe('是否必填'),
        placeholder: z.string().describe('占位提示文字'),
        options: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .describe('下拉选项'),
        defaultValue: z.string().describe('默认值'),
      }),
    )
    .describe('form: 表单字段列表'),
  submitLabel: z.string().describe('form: 提交按钮文字'),

  summary: z.string().describe('confirmation: 操作摘要说明'),
  confirmLabel: z.string().describe('confirmation: 确认按钮文字'),
  cancelLabel: z.string().describe('confirmation: 取消按钮文字'),
  severity: z.string().describe("confirmation: 'info','warning','danger'"),

  sections: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe('card: 信息字段'),
  status: z
    .object({
      label: z.string().describe('状态文字'),
      color: z.string().describe("状态颜色: 'green','yellow','red','blue','gray'"),
    })
    .describe('card: 状态信息'),

  steps: z
    .array(
      z.object({
        label: z.string().describe('步骤名称'),
        status: z.string().describe("'completed','current','pending'"),
      }),
    )
    .describe('steps: 步骤列表'),

  columns: z
    .array(z.object({ key: z.string(), label: z.string() }))
    .describe('table: 列定义'),
  rows: z.array(z.array(z.string())).describe('table: 数据行'),

  buttons: z
    .array(
      z.object({
        label: z.string().describe('按钮文字'),
        value: z.string().describe('按钮动作值'),
        style: z.string().describe("'primary','secondary','danger'"),
      }),
    )
    .describe('action_buttons: 按钮列表'),
});

export const aiUIResponseSchema = z.object({
  message: z.string().describe('自然语言回复文本'),
  components: z.array(uiComponentSchema).describe('UI 组件列表'),
});

export type AIUIResponse = z.infer<typeof aiUIResponseSchema>;
