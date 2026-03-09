const { RegionDaemonClient } = require('./dist/region-daemon/RegionDaemonClient');

async function testE2E() {
  console.log('=== 端到端测试：RegionDaemon 62191 端口 ===\n');

  const client = new RegionDaemonClient('test');

  // 测试 1: 简单命令执行
  console.log('测试 1: 简单命令执行');
  try {
    const result1 = await client.execute('agent', 'echo "Hello from 62191"', 5000);
    console.log('✅ 成功:', result1.stdout.trim());
  } catch (error) {
    console.log('❌ 失败:', error.message);
  }

  // 测试 2: 验证用户和路径
  console.log('\n测试 2: 验证用户和路径');
  try {
    const result2 = await client.execute('agent', 'whoami && pwd', 5000);
    console.log('✅ 成功:', result2.stdout.trim());
  } catch (error) {
    console.log('❌ 失败:', error.message);
  }

  // 测试 3: opencode 版本检查
  console.log('\n测试 3: opencode 版本检查');
  try {
    const result3 = await client.execute('agent', 'opencode --version', 5000);
    console.log('✅ 成功: opencode', result3.stdout.trim());
  } catch (error) {
    console.log('❌ 失败:', error.message);
  }

  // 测试 4: 验证端口互补关系
  console.log('\n测试 4: 验证端口互补关系');
  const WORLD_PORT = 3344;
  const REGION_PORT = 62191;
  const complement = WORLD_PORT | REGION_PORT;
  console.log(`World: ${WORLD_PORT}, Region: ${REGION_PORT}`);
  console.log(`互补验证: ${WORLD_PORT} | ${REGION_PORT} = ${complement} (0xFFFF = ${0xffff})`);
  console.log(complement === 0xffff ? '✅ 互补关系正确' : '❌ 互补关系错误');

  console.log('\n=== 所有测试完成 ===');
}

testE2E().catch(console.error);
