import { Command } from "@oclif/core";
import { APIClient } from "../utils/apiClient";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export default class Start extends Command {
  static description = "启动 TheWorld 服务器";

  async run() {
    const client = new APIClient();

    if (await client.isServerRunning()) {
      this.log("✅ TheWorld 服务器已经在运行");
      return;
    }

    this.log("🚀 启动 TheWorld 服务器...");

    const serverPath = path.join(__dirname, "../../server/index.js");
    const worldDir = path.join(process.env.HOME || "/tmp", ".the-world");
    const pidFile = path.join(worldDir, "server.pid");
    const logFile = path.join(worldDir, "server.log");

    if (!fs.existsSync(serverPath)) {
      this.error("服务器文件不存在，请先运行 npm run build");
    }

    if (!fs.existsSync(worldDir)) {
      fs.mkdirSync(worldDir, { recursive: true });
    }

    const logFd = fs.openSync(logFile, "a");

    const server = spawn("node", [serverPath], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    });

    server.unref();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (fs.existsSync(pidFile)) {
      this.log("✅ TheWorld 服务器已启动");
      this.log(`   PID: ${fs.readFileSync(pidFile, "utf-8")}`);
      this.log("   Server: http://localhost:3344");
      this.log("   AI Proxy: http://localhost:3344/v1");
      this.log(`   日志文件: ${logFile}`);
    } else {
      this.error(`❌ 启动失败，请检查日志: ${logFile}`);
    }
  }
}
