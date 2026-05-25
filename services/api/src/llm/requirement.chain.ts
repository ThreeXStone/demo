import { createChatModel } from './model.factory';
import { requirementPromptTemplate } from './requirement.prompt-builder';
import { StringOutputParser } from '@langchain/core/output_parsers';

export const requirementChain = requirementPromptTemplate.pipe(createChatModel()).pipe(new StringOutputParser());