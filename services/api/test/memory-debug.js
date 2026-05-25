// 手动设置环境变量
process.env.OPENAI_API_KEY = 'sk-bAHQ4PxobK6sdR9L2eC02d2268864565898c00F33aE0B8A9';
process.env.OPENAI_BASE_URL = 'https://ai-yyds.com/v1';

// 测试基本配置
console.log('Testing basic config...');
console.log('API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'MISSING');
console.log('BASE_URL:', process.env.OPENAI_BASE_URL ? 'SET' : 'MISSING');

// 测试 ChatOpenAI 创建
try {
  const ChatOpenAI = require('@langchain/openai').ChatOpenAI;
  console.log('ChatOpenAI imported');

  const config = {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
  };

  const model = new ChatOpenAI(config);
  console.log('ChatOpenAI created');

  const result = model.invoke([{ role: 'user', content: '测试' }]);
  console.log('Invoke result:', result);

} catch (e) {
  console.log('Error creating ChatOpenAI:', e.message);
  // Log full error details
  console.log('Error:', JSON.stringify(e));
}