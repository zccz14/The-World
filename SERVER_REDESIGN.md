# TheWorld 服务架构重新设计

## 问题分析

当前设计问题：
1. 每个命令都创建新的 Proxy Server 实例
2. 无法保持状态（AI 身份注册信息会丢失）
3. 没有统一的服务入口

## 新架构设计

```
宿主机
│
├── the-world-daemon (HTTP Server, 后台运行)
│   ├── 端口: 1996 (TheWorld API Server)
│   ├── AI Proxy Server (:3456)
│   ├── 状态管理:
│   │   ├── AI 身份注册表
│   │   ├── Region 列表
│   │   └── 配置缓存
│   └── API 接口:
│       ├── POST /api/regions          # 创建 Region
│       ├── GET  /api/regions          # 列出 Region
│       ├── POST /api/ai               # 创建 AI
│       ├── GET  /api/ai               # 列出 AI
│       ├── POST /api/ai/exec          # 执行命令
│       ├── POST /api/oracle/send      # 发送神谕
│       └── GET  /health               # 健康检查
│
├── dio CLI (HTTP 客户端)
│   ├── dio start                      # 启动 daemon
│   ├── dio stop                       # 停止 daemon
│   ├── dio status                     # 查看 daemon 状态
│   ├── dio region create <name>       # 调用 POST /api/regions
│   ├── dio region list                # 调用 GET /api/regions
│   ├── dio ai create <name>           # 调用 POST /api/ai
│   ├── dio ai exec <ai> <cmd>         # 调用 POST /api/ai/exec
│   └── dio oracle send                # 调用 POST /api/oracle/send
│
├── EverMemOS (已部署)
│   └── http://localhost:1995
│
└── Region 容器
    └── ...
```

## 实现细节

### 1. TheWorld Daemon Server

```typescript
// src/server/TheWorldServer.ts
import express from 'express';
import { AIProxyServer } from '../proxy/AIProxyServer';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionManager } from '../core/RegionManager';
import { AIUserManager } from '../core/AIUserManager';

export class TheWorldServer {
  private app = express();
  private proxy: AIProxyServer;
  private memory: WorldMemory;
  private regionManager: RegionManager;
  private aiManager: AIUserManager;

  constructor() {
    this.app.use(express.json());
    this.setupRoutes();
    this.initializeServices();
  }

  private async initializeServices() {
    this.memory = new WorldMemory(Config.EVERMEMOS_URL);
    this.proxy = new AIProxyServer({
      port: Config.AI_PROXY_PORT,
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory: this.memory,
    });
    this.regionManager = new RegionManager(this.memory, this.proxy);
    this.aiManager = new AIUserManager(this.memory, this.proxy);
  }

  private setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: Date.now() });
    });

    // Region 管理
    this.app.post('/api/regions', async (req, res) => {
      const { name } = req.body;
      await this.regionManager.createRegion(name);
      res.json({ status: 'ok', region: name });
    });

    this.app.get('/api/regions', async (req, res) => {
      const regions = await this.regionManager.listRegions();
      res.json({ regions });
    });

    // AI 管理
    this.app.post('/api/ai', async (req, res) => {
      const { name, region } = req.body;
      const dummyKey = await this.aiManager.createAI(name, region);
      res.json({ status: 'ok', ai: name, dummyKey });
    });

    this.app.get('/api/ai', async (req, res) => {
      const { region } = req.query;
      const aiList = await this.aiManager.listAI(region as string);
      res.json({ aiList });
    });

    // AI 执行命令
    this.app.post('/api/ai/exec', async (req, res) => {
      const { ai, region, command } = req.body;
      const result = await this.aiManager.execCommand(ai, region, command);
      res.json({ result });
    });

    // 神谕
    this.app.post('/api/oracle/send', async (req, res) => {
      const { to, region, message } = req.body;
      // 实现神谕逻辑
      res.json({ status: 'ok' });
    });
  }

  start(port: number = 1996) {
    this.app.listen(port, () => {
      logger.info(`TheWorld Server started on port ${port}`);
    });
  }
}
```

### 2. CLI 改造

每个命令变成 HTTP 客户端：

```typescript
// src/cli/utils/apiClient.ts
import axios from 'axios';

export class APIClient {
  private baseUrl = 'http://localhost:1996';

  async createRegion(name: string) {
    const response = await axios.post(`${this.baseUrl}/api/regions`, { name });
    return response.data;
  }

  async listRegions() {
    const response = await axios.get(`${this.baseUrl}/api/regions`);
    return response.data.regions;
  }

  // ... 其他 API 方法
}
```

### 3. Daemon 生命周期管理

```bash
# 启动 daemon（后台运行）
dio start
# 或前台运行（用于调试）
dio start --foreground

# 检查状态
dio status
# 返回：Server running on port 1996
#       AI Proxy running on port 3456
#       Regions: 2
#       AI Users: 3

# 停止 daemon
dio stop
```

## 优势

1. **状态持久化**：AI 身份注册信息保存在内存中
2. **统一入口**：所有操作通过 HTTP API
3. **易于扩展**：可以添加 Web UI、WebSocket 等
4. **监控友好**：统一的健康检查和状态查询
5. **资源效率**：只运行一个 Proxy Server 实例

## 实现计划

### Phase 1: Server 实现（优先）
1. 创建 `TheWorldServer` 类
2. 实现所有 HTTP API 接口
3. 添加状态管理

### Phase 2: CLI 改造
1. 创建 `APIClient` 类
2. 改造所有命令为 HTTP 客户端
3. 添加 `dio start` 和 `dio stop` 命令

### Phase 3: Daemon 管理
1. 实现后台运行（使用 PM2 或自定义）
2. 实现 PID 文件管理
3. 添加日志轮转

### Phase 4: 测试和文档
1. 端到端测试
2. API 文档
3. 用户指南

## 需要确认

1. **Server 端口**：使用 1996（EverMemOS 用 1995），可以吗？
2. **Daemon 管理**：使用 PM2（需要额外依赖）还是自己实现？
3. **配置文件**：继续使用 .env 还是改用配置文件（config.json）？

请确认后我开始实现。
