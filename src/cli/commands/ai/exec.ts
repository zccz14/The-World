import { Command, Flags } from '@oclif/core';
import { AIUserManager } from '../../../core/AIUserManager';
import { AIProxyServer } from '../../../proxy/AIProxyServer';
import { WorldMemory } from '../../../memory/MemoryManager';
import { Config } from '../../../utils/config';

export default class AIExec extends Command {
  static description = '在 AI 上执行命令';

  static flags = {
    ai: Flags.string({ char: 'a', description: 'AI 名称', required: true }),
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
    cmd: Flags.string({ char: 'c', description: '要执行的命令', required: true }),
  };

  async run() {
    const { flags } = await this.parse(AIExec);

    const memory = new WorldMemory(Config.EVERMEMOS_URL);
    const proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory,
    });

    const aiManager = new AIUserManager(memory, proxy);

    try {
      const result = await aiManager.execCommand(flags.ai, flags.region, flags.cmd);
      this.log(result);
    } catch (error: any) {
      this.error(`执行命令失败: ${error.message}`);
    }
  }
}
