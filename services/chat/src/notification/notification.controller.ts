import { Controller, Get, Query } from '@nestjs/common';

@Controller('api/notifications')
export class NotificationController {
  @Get()
  async list(@Query('since') since?: string) {
    return [];
  }
}
