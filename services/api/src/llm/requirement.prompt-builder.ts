import { ChatPromptTemplate } from '@langchain/core/prompts';
import { REQUIREMENT_SYSTEM_PROMPT, REQUIREMENT_USER_TEMPLATE } from './prompts/requirement.prompt';

export const requirementPromptTemplate = ChatPromptTemplate.fromMessages([
  ['system', REQUIREMENT_SYSTEM_PROMPT],
  ['user', REQUIREMENT_USER_TEMPLATE],
]);