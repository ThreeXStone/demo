import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { AdvancedAnalysisService } from './advanced-analysis.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

interface AnalyzeRequest {
  conversationId: string;
  input: string;
}

@Controller('api/advanced')
export class AdvancedController {
  constructor(private readonly advancedAnalysisService: AdvancedAnalysisService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async executeAnalyze(@Request() req: any, @Body() body: AnalyzeRequest) {
    return this.advancedAnalysisService.analyze(req.user.userId, body.conversationId, body.input);
  }
}
