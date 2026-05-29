import { z } from 'zod';

// --- Component Schemas ---

const textResponseSchema = z.object({
  type: z.literal('text'),
  content: z.string().describe('Markdown 文本内容'),
});

const selectionResponseSchema = z.object({
  type: z.literal('selection'),
  title: z.string().describe('选项标题'),
  options: z
    .array(
      z.object({
        label: z.string().describe('选项文字'),
        value: z.string().describe('选项值'),
        description: z.string().optional().describe('补充说明'),
      }),
    )
    .min(2)
    .describe('可选项列表'),
  allowMultiple: z.boolean().optional().describe('是否允许多选'),
});

const formResponseSchema = z.object({
  type: z.literal('form'),
  title: z.string().describe('表单标题'),
  fields: z
    .array(
      z.object({
        name: z.string().describe('字段标识'),
        label: z.string().describe('字段标签'),
        fieldType: z.enum(['input', 'select', 'textarea', 'date', 'number']).describe('字段类型'),
        required: z.boolean().optional().describe('是否必填'),
        placeholder: z.string().optional().describe('占位提示'),
        options: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .optional()
          .describe('下拉选项'),
        defaultValue: z.string().optional().describe('默认值'),
      }),
    )
    .describe('表单字段'),
  submitLabel: z.string().optional().describe('提交按钮文字'),
});

const confirmationResponseSchema = z.object({
  type: z.literal('confirmation'),
  title: z.string().describe('确认标题'),
  summary: z.string().describe('操作摘要'),
  confirmLabel: z.string().optional().describe('确认按钮文字'),
  cancelLabel: z.string().optional().describe('取消按钮文字'),
  severity: z.enum(['info', 'warning', 'danger']).optional().describe('严重程度'),
});

const cardResponseSchema = z.object({
  type: z.literal('card'),
  title: z.string().describe('卡片标题'),
  sections: z
    .array(z.object({ label: z.string().describe('字段标签'), value: z.string().describe('字段值') }))
    .describe('信息字段'),
  status: z
    .object({
      label: z.string().describe('状态文字'),
      color: z.enum(['green', 'yellow', 'red', 'blue', 'gray']).describe('状态颜色'),
    })
    .optional()
    .describe('状态信息'),
});

const stepsResponseSchema = z.object({
  type: z.literal('steps'),
  steps: z
    .array(
      z.object({
        label: z.string().describe('步骤名称'),
        status: z.enum(['completed', 'current', 'pending']).describe('步骤状态'),
      }),
    )
    .describe('步骤列表'),
});

const tableResponseSchema = z.object({
  type: z.literal('table'),
  columns: z
    .array(z.object({ key: z.string().describe('列标识'), label: z.string().describe('列标题') }))
    .describe('列定义'),
  rows: z.array(z.record(z.string(), z.string())).describe('数据行，key 对应 column.key'),
});

const actionButtonsResponseSchema = z.object({
  type: z.literal('action_buttons'),
  title: z.string().optional().describe('按钮组标题'),
  buttons: z
    .array(
      z.object({
        label: z.string().describe('按钮文字'),
        value: z.string().describe('按钮值'),
        style: z.enum(['primary', 'secondary', 'danger']).optional().describe('按钮样式'),
      }),
    )
    .describe('按钮列表'),
});

// --- Discriminated Union ---

export const uiComponentSchema = z.discriminatedUnion('type', [
  textResponseSchema,
  selectionResponseSchema,
  formResponseSchema,
  confirmationResponseSchema,
  cardResponseSchema,
  stepsResponseSchema,
  tableResponseSchema,
  actionButtonsResponseSchema,
]);

export const aiUIResponseSchema = z.object({
  message: z.string().describe('自然语言回复文本'),
  components: z.array(uiComponentSchema).describe('UI 组件列表，0-3 个'),
});

export type AIUIResponse = z.infer<typeof aiUIResponseSchema>;
