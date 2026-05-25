import * as fs from 'fs';
import * as path from 'path';
import { RunnableMemoryService } from '../src/llm/memory/runnable-memory.service';

// 加载环境变量
process.chdir(path.join(__dirname, '..'));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key] = valueParts.join('=');
      }
    });
}

describe('Runnable Memory - 电商客服场景', () => {
  const memoryService = new RunnableMemoryService();

  const sessionId = 's1';

  it('should handle multi-turn conversation', async () => {
    // 第一轮：退货问题
    const r1 = await memoryService.chat(sessionId, '我买的蓝牙耳机降噪效果不好，想退货');
    expect(r1).toBeDefined();
    expect(typeof r1).toBe('string');

    const h1 = memoryService.getHistory(sessionId);
    expect(h1).toHaveLength(2); // human + ai

    // 第二轮：提供订单号
    const r2 = await memoryService.chat(sessionId, '订单号是 EC20240315001');
    expect(r2).toBeDefined();

    const h2 = memoryService.getHistory(sessionId);
    expect(h2).toHaveLength(4); // 2轮对话 × 2

    // 第三轮：询问能否退货
    const r3 = await memoryService.chat(sessionId, '帮我判断一下这个订单能不能退');
    expect(r3).toBeDefined();

    const h3 = memoryService.getHistory(sessionId);
    expect(h3).toHaveLength(6); // 3轮对话 × 2

    // 验证历史消息包含关键词
    const h3Text = JSON.stringify(h3);
    expect(h3Text).toContain('蓝牙耳机');
    expect(h3Text).toContain('EC20240315001');
    expect(h3Text).toContain('能不能退');
  }, 90000);

  it('should support message trimming at maxTokens', async () => {
    const sessionId = 's2';

    // 发送大量消息，超过 2000 tokens
    for (let i = 0; i < 10; i++) {
      await memoryService.chat(sessionId, '测试消息'.repeat(100));
    }

    const history = memoryService.getHistory(sessionId);
    const estimatedTokens = history.reduce((sum, msg) => sum + memoryService['estimateTokens'](msg.content), 0);

    // 验证被裁剪了
    expect(estimatedTokens).toBeLessThanOrEqual(2000);
  }, 30000);

  it('should support clearing session', async () => {
    const sessionId = 's3';

    await memoryService.chat(sessionId, '第一条消息');
    expect(memoryService.getHistory(sessionId)).toHaveLength(2);

    await memoryService.clearSession(sessionId);
    expect(memoryService.getHistory(sessionId)).toHaveLength(0);
  }, 30000);
});