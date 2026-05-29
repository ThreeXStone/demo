import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SearchService } from './search.service';

@Controller('api/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async search(
    @Request() req: any,
    @Body('query') query: string,
    @Body('topK') topK?: number,
  ) {
    return this.searchService.similaritySearch(query, req.user.userId, topK);
  }
}
