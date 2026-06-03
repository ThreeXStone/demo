import { Controller, Get, Query } from '@nestjs/common';

@Controller('chat/notifications')
export class NotificationController {
  @Get()
  async list(@Query('since') since?: string) {
    return [];
  }
}
