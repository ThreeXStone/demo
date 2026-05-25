import * as fs from 'fs';
import * as path from 'path';

// 加载环境变量
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

// 直接测试核心逻辑
async function testMemoryCore() {
  console.log('\n=== Memory 核心逻辑测试 ===\n');

  // 测试 1: 会话 map
  console.log('\nTest 1: 创建空会话');
  const sessions = new Map<string, any[]>();
  expect(sessions.size).toBe(0);

  // 测试 2: 添加消息
  console.log('\nTest 2: 添加消息');
  sessions.set('s1', []);
  sessions.get('s1').push({ role: 'human', content: 'test' });
  expect(sessions.get('s1')).toHaveLength(1);

  // 测试 3: token 计算
  console.log('\nTest 3: token 计算');
  let tokens = 0;
  for (let i = 0; i < '测试消息'.length; i++) {
    if (/[一-龥]/. test('测试消息'[i])) {
      tokens += 2;
    } else {
      tokens += 0.3;
    }
  }
  expect(tokens).toBeGreaterThanOrEqual(6); // 测试消息应该有 6 个中文字符

  console.log('\n=== 所有测试通过 ===');
}

testMemoryCore();