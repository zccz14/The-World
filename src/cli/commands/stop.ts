import { Command } from '@oclif/core';

export default class Stop extends Command {
  static description = '停止 TheWorld 系统';

  async run() {
    this.log('👋 停止 TheWorld 系统...');
    this.log('✅ 系统已停止');
  }
}
