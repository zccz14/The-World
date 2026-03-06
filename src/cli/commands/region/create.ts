import { Command, Flags } from '@oclif/core';
import { RegionManager } from '../../../core/RegionManager';
import { AIProxyServer } from '../../../proxy/AIProxyServer';
import { WorldMemory } from '../../../memory/MemoryManager';
import { Config } from '../../../utils/config';

export default class RegionCreate extends Command {
  static description = '创建 Region';

  static flags = {
    name: Flags.string({ char: 'n', description: 'Region 名称', required: true }),
  };

  async run() {
    const { flags } = await this.parse(RegionCreate);

    this.log(`🔨 创建 Region: ${flags.name}`);

    const memory = new WorldMemory(Config.EVERMEMOS_URL);
    const proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory,
    });

    const regionManager = new RegionManager(memory, proxy);

    try {
      await regionManager.createRegion(flags.name);
      this.log(`✅ Region ${flags.name} 已创建`);
    } catch (error: any) {
      this.error(`创建 Region 失败: ${error.message}`);
    }
  }
}
