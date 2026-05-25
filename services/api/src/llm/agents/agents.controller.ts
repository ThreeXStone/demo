import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

interface OrchestrateRequest {
  input: string;
}

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post('orchestrate')
  @HttpCode(HttpStatus.OK)
  async orchestrate(@Body() body: OrchestrateRequest) {
    const result = await this.orchestratorService.orchestrate(body.input);
    return result;
  }
}