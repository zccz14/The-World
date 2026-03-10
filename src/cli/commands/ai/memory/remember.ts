import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../../utils/apiClient';

export default class AIMemoryRemember extends Command {
  static description = '写入 AI 记忆（异步 remember）';

  static flags = {
    to: Flags.string({ char: 't', description: '目标 AI 名称', required: true }),
    content: Flags.string({ char: 'c', description: '记忆内容', required: true }),
    kind: Flags.string({
      char: 'k',
      description: '记忆类型',
      required: true,
      options: ['fact', 'key_dialogue', 'decision', 'constraint', 'todo', 'lesson', 'episode'],
    }),
    importance: Flags.integer({ char: 'i', description: '重要度 1-5', default: 3 }),
    source: Flags.string({ char: 's', description: '来源标识', default: 'dio-ai-memory-remember' }),
  };

  async run() {
    const { flags } = await this.parse(AIMemoryRemember);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const result = await client.rememberMemory({
        aiName: flags.to,
        content: flags.content,
        kind: flags.kind as
          | 'fact'
          | 'key_dialogue'
          | 'decision'
          | 'constraint'
          | 'todo'
          | 'lesson'
          | 'episode',
        importance: flags.importance,
        source: flags.source,
      });

      this.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      this.error(`写入记忆失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
