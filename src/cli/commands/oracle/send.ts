import { Command, Flags } from '@oclif/core';
import { WorldMemory } from '../../../memory/MemoryManager';
import { Config } from '../../../utils/config';
import Docker from 'dockerode';
import path from 'path';

export default class OracleSend extends Command {
  static description = '向 AI 发送神谕消息';

  static flags = {
    to: Flags.string({ char: 't', description: '目标 AI 名称', required: true }),
    message: Flags.string({ char: 'm', description: '神谕内容', required: true }),
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
  };

  async run() {
    const { flags } = await this.parse(OracleSend);

    this.log(`📨 发送神谕给 ${flags.to}...`);

    const memory = new WorldMemory(Config.EVERMEMOS_URL);

    await memory.logOracle({
      aiName: flags.to,
      regionId: flags.region,
      content: flags.message,
    });

    const docker = new Docker();
    const container = docker.getContainer(flags.region);

    const hostDir = path.join(process.env.WORLD_DATA_DIR || process.env.HOME || '/tmp', '.the-world', 'regions', flags.region, 'inbox');
    const inboxFile = `oracle-${Date.now()}.msg`;
    
    const content = JSON.stringify({
      to: flags.to,
      from: 'human',
      content: flags.message,
      timestamp: Date.now(),
    });

    try {
      const exec = await container.exec({
        Cmd: ['sh', '-c', `echo '${content}' > /world/inbox/${inboxFile}`],
        AttachStdout: true,
        AttachStderr: true,
      });

      await exec.start({ Detach: false });

      this.log(`✅ 神谕已发送给 ${flags.to}`);
      this.log(`   文件: /world/inbox/${inboxFile}`);
    } catch (error: any) {
      this.error(`发送神谕失败: ${error.message}`);
    }
  }
}
