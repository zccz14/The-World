import { Command } from '@oclif/core';
import { RegionManager } from '../../../core/RegionManager';
import { AIProxyServer } from '../../../proxy/AIProxyServer';
import { WorldMemory } from '../../../memory/MemoryManager';
import { Config } from '../../../utils/config';

export default class RegionList extends Command {
  static description = '列出所有 Region';

  async run() {
    const memory = new WorldMemory(Config.EVERMEMOS_URL);
    const proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory,
    });

    const regionManager = new RegionManager(memory, proxy);

    const regions = await regionManager.listRegions();

    if (regions.length === 0) {
      this.log('暂无 Region');
      return;
    }

    this.log('Region 列表:');
    regions.forEach(region => {
      this.log(`  - ${region}`);
    });
  }
}
