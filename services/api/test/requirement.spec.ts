import * as fs from 'fs';
import * as path from 'path';
import { RequirementService } from '../src/llm/requirement.service';

// 修复 process.cwd() 路径问题（Jest 在项目根目录运行）
process.chdir(path.join(__dirname, '..'));

// 手动加载 .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key] = valueParts.join('=');
    }
  });
}

describe('Requirement Extract', () => {
  const service = new RequirementService();

  it('should extract correctly', async () => {
    const result = await service.extract('用户注册时必须绑定手机号，密码至少8位');

    expect(result.action).toBeDefined();
    expect(result.constraints).toBeDefined();
    expect(result.entities).toBeDefined();

    expect(typeof result.action).toBe('string');
    expect(Array.isArray(result.constraints)).toBe(true);
    expect(Array.isArray(result.entities)).toBe(true);

    const text = JSON.stringify(result).toLowerCase();
    expect(text).toContain('手机号');
    expect(text).toContain('密码');
  }, 30000);
});