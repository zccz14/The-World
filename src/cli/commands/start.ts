import { Command } from '@oclif/core';
import { AIProxyServer } from '../../proxy/AIProxyServer';
import { WorldMemory } from '../../memory/MemoryManager';
import { Config } from '../../utils/config';

export default class Start extends Command {
  static description = '启动 TheWorld 系统';

  async run() {
    this.log('🚀 启动 TheWorld 系统...');

    const validation = Config.validate();
    if (!validation.valid) {
      this.error(`Missing environment variables: ${validation.missing.join(', ')}`);
    }

    const memory = new WorldMemory(Config.EVERMEMOS_URL);

    this.log('⏳ 检查 EverMemOS 连接...');
    try {
      const EverMemOSClient = require('../../memory/EverMemOSClient').EverMemOSClient;
      const client = new EverMemOSClient(Config.EVERMEMOS_URL);
      const healthy = await client.healthCheck();
      
      if (!healthy) {
        this.warn('⚠️  EverMemOS 连接失败，请确保已启动 EverMemOS');
      } else {
        this.log('✅ EverMemOS 连接成功');
      }
    } catch (error) {
      this.warn('⚠️  无法连接到 EverMemOS');
    }

    this.log('🔧 启动 AI 代理服务器...');
    const proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory,
    });

    this.log('✅ TheWorld 系统已启动');
    this.log(`  - AI Proxy: http://localhost:${Config.AI_PROXY_PORT}`);
    this.log(`  - EverMemOS: ${Config.EVERMEMOS_URL}`);
    this.log('\n按 Ctrl+C 停止服务器');

    process.on('SIGINT', () => {
      this.log('\n\n👋 停止 TheWorld 系统...');
      process.exit(0);
    });
  }
}
