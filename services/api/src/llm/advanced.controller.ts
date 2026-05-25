import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AdvancedAnalysisService } from './advanced-analysis.service';

interface AnalyzeRequest {
  sessionId: string;
  input: string;
}

@Controller('api/advanced')
export class AdvancedController {
  constructor(private readonly advancedAnalysisService: AdvancedAnalysisService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async executeAnalyze(@Body() body: AnalyzeRequest) {
    const result = await this.advancedAnalysisService.analyze(body.sessionId, body.input);
    return result;
  }
}