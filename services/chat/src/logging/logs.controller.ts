import { Controller, Get, Req, Res } from '@nestjs/common';
import { getRecentLogs, onLog } from './log-capture';

@Controller('chat/logs')
export class LogsController {
  @Get('stream')
  async stream(@Req() req: any, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 回放缓冲区已有日志
    for (const entry of getRecentLogs()) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    // 实时推送
    const unsubscribe = onLog((entry) => {
      try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
    });

    req.on('close', () => {
      unsubscribe();
    });
  }
}
