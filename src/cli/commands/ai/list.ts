import { Command, Flags } from '@oclif/core';
import { AIUserManager } from '../../../core/AIUserManager';
import { AIProxyServer } from '../../../proxy/AIProxyServer';
import { WorldMemory } from '../../../memory/MemoryManager';
import { Config } from '../../../utils/config';

export default class AIList extends Command {
  static description = '列出 Region 内的所有 AI';

  static flags = {
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
  };

  async run() {
    const { flags } = await this.parse(AIList);

    const memory = new WorldMemory(Config.EVERMEMOS_URL);
    const proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory,
    });

    const aiManager = new AIUserManager(memory, proxy);

    const aiList = await aiManager.listAI(flags.region);

    if (aiList.length === 0) {
      this.log(`Region ${flags.region} 暂无 AI`);
      return;
    }

    this.log(`Region ${flags.region} 的 AI 列表:`);
    aiList.forEach(ai => {
      this.log(`  - ${ai}`);
    });
  }
}
