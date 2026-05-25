import { Controller, Post, Body, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { LlmService } from './llm.service';
import { RequirementService } from './requirement.service';

interface InvokeRequest {
  input: string;
}

@Controller('api/langchain')
export class LlmController {
  constructor(
    private readonly llmService: LlmService,
    private readonly requirementService: RequirementService,
  ) {}

  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(@Body() body: InvokeRequest): Promise<{ output: string }> {
    const input = body.input || '用户注册时必须绑定手机号，密码至少8位';
    const output = await this.llmService.invoke(input);
    return { output };
  }

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  async stream(@Body() body: InvokeRequest, @Res() res: Response): Promise<void> {
    const input = body.input || '用户注册时必须绑定手机号，密码至少8位';

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
      for await (const chunk of this.llmService.stream(input)) {
        res.write(chunk);
      }
      res.end();
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
    }
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async batch(@Body() body: { inputs?: string[] }): Promise<{ outputs: string[] }> {
    const inputs = body.inputs || ['用户注册时必须绑定手机号，密码至少8位'];
    const outputs = await this.llmService.batch(inputs);
    return { outputs };
  }

  @Post('prompt-preview')
  @HttpCode(HttpStatus.OK)
  async promptPreview(@Body() body: InvokeRequest): Promise<{ system: string; user: string; formatted: string[] }> {
    const input = body.input || '用户注册时必须绑定手机号，密码至少8位';
    return this.llmService.renderPrompt(input);
  }

  @Post('prompt-to-model')
  @HttpCode(HttpStatus.OK)
  async promptToModel(@Body() body: InvokeRequest): Promise<{ output: string }> {
    const input = body.input || '用户注册时必须绑定手机号，密码至少8位';
    const output = await this.llmService.invokeWithTemplate(input);
    return { output };
  }

  @Post('chain-invoke')
  async chainInvoke(@Body() body: { input: string }) {
    return this.llmService.chainInvoke(body.input);
  }

  @Post('chain-stream')
  @HttpCode(HttpStatus.OK)
  async chainStream(@Body() body: { input: string }, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
      for await (const chunk of this.llmService.chainStream(body.input)) {
        res.write(chunk);
      }
      res.end();
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
    }
  }

  @Post('chain-batch')
  async chainBatch(@Body() body: { inputs?: string[] }) {
    return this.llmService.chainBatch(body.inputs || ['用户注册时必须绑定手机号，密码至少8位']);
  }

  @Post('structured')
  async structured(@Body() body: { input: string }) {
    const result = await this.requirementService.extract(body.input);
    return { result };
  }

  @Post('tool-bind')
  async toolBind(@Body() body: { input: string }) {
    return this.llmService.toolBind(body.input);
  }

  @Post('tool-loop')
  async toolLoop(@Body() body: { input: string }) {
    return this.llmService.toolLoop(body.input);
  }
}