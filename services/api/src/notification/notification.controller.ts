import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { NotificationService } from './notification.service';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query('since') since?: string,
  ) {
    return this.notificationService.getForUser(req.user.userId, since);
  }
}
