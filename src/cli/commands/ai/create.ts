import { Command, Flags } from '@oclif/core';
import { AIUserManager } from '../../../core/AIUserManager';
import { AIProxyServer } from '../../../proxy/AIProxyServer';
import { WorldMemory } from '../../../memory/MemoryManager';
import { Config } from '../../../utils/config';

export default class AICreate extends Command {
  static description = '创建 AI 用户';

  static flags = {
    name: Flags.string({ char: 'n', description: 'AI 名称', required: true }),
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
  };

  async run() {
    const { flags } = await this.parse(AICreate);

    this.log(`🤖 创建 AI: ${flags.name} (Region: ${flags.region})`);

    const memory = new WorldMemory(Config.EVERMEMOS_URL);
    const proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory,
    });

    const aiManager = new AIUserManager(memory, proxy);

    try {
      const dummyKey = await aiManager.createAI(flags.name, flags.region);
      this.log(`✅ AI ${flags.name} 已创建`);
      this.log(`   Dummy Key: ${dummyKey}`);
    } catch (error: any) {
      this.error(`创建 AI 失败: ${error.message}`);
    }
  }
}
