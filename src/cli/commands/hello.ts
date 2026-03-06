import { Command } from '@oclif/core';

export default class HelloWorld extends Command {
  static description = '测试 CLI 是否工作';

  async run() {
    this.log('Hello World! TheWorld CLI is working.');
  }
}
