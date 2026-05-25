import { Controller, Get, Post, Body } from '@nestjs/common';
import { APP_NAME } from '@repo/contracts';
import { RequirementService } from './llm/requirement.service';

@Controller()
export class AppController {
  constructor(private readonly requirementService: RequirementService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('hello')
  hello() {
    return { message: `Hello from API, shared APP_NAME=${APP_NAME}` };
  }

  @Post('requirement/extract')
  async extract(@Body() body: { input: string }) {
    const result = await this.requirementService.extract(body.input);
    return { result };
  }
}
