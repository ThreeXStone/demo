import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const checkConstraintValidityTool = tool(
  async ({ constraint }) => {
    // 模拟约束检查逻辑
    const validKeywords = ['必须', '至少', '不超过', '等于', '包含', '不包含'];
    const isValid = validKeywords.some(keyword => constraint.includes(keyword));
    return {
      constraint,
      is_valid: isValid,
      message: isValid ? '约束格式正确' : '约束格式无效，建议使用明确的限定词',
    };
  },
  {
    name: 'check_constraint_validity',
    description: '检查约束条件的有效性',
    schema: z.object({
      constraint: z.string().describe('约束条件文本'),
    }),
  }
);

export const lookupEntityDefinitionTool = tool(
  async ({ entity }) => {
    // 模拟实体定义查找
    const entityDefinitions: Record<string, { definition: string; type: string }> = {
      手机号: { definition: '用户联系方式，格式为11位数字', type: 'string' },
      密码: { definition: '用户登录凭证，长度8-32位', type: 'string' },
      用户名: { definition: '用户唯一标识符，长度4-20位', type: 'string' },
      邮箱: { definition: '用户邮箱地址，需符合邮箱格式', type: 'string' },
    };

    const def = entityDefinitions[entity];
    if (def) {
      return { entity, found: true, definition: def.definition, type: def.type };
    }
    return { entity, found: false, definition: '未找到实体定义' };
  },
  {
    name: 'lookup_entity_definition',
    description: '查找实体的定义和类型',
    schema: z.object({
      entity: z.string().describe('实体名称'),
    }),
  }
);

export const basicTools = [checkConstraintValidityTool, lookupEntityDefinitionTool];