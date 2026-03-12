# TheWorld Service Architecture Redesign

## Problem Analysis

Current design issues:
1. Each command creates a new Proxy Server instance
2. Unable to maintain state (AI identity registration information is lost)
3. No unified service entry point

## New Architecture Design

```
Host Machine
│
├── the-world-daemon (HTTP Server, runs in background)
│   ├── Port: 1996 (TheWorld API Server)
│   ├── AI Proxy Server (:3456)
│   ├── State Management:
│   │   ├── AI Identity Registry
│   │   ├── Region List
│   │   └── Configuration Cache
│   └── API Endpoints:
│       ├── POST /api/regions          # Create Region
│       ├── GET  /api/regions          # List Regions
│       ├── POST /api/ai               # Create AI
│       ├── GET  /api/ai               # List AI
│       ├── POST /api/ai/exec          # Execute Command
│       ├── POST /api/oracle/send      # Send Oracle
│       └── GET  /health               # Health Check
│
├── dio CLI (HTTP Client)
│   ├── dio start                      # Start daemon
│   ├── dio stop                       # Stop daemon
│   ├── dio status                     # Check daemon status
│   ├── dio region create <name>       # Calls POST /api/regions
│   ├── dio region list                # Calls GET /api/regions
│   ├── dio ai create <name>           # Calls POST /api/ai
│   ├── dio ai exec <ai> <cmd>         # Calls POST /api/ai/exec
│   └── dio oracle send                # Calls POST /api/oracle/send
│
├── EverMemOS (Deployed)
│   └── http://localhost:1995
│
└── Region Containers
    └── ...
```

## Implementation Details

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
    // Health Check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: Date.now() });
    });

    // Region Management
    this.app.post('/api/regions', async (req, res) => {
      const { name } = req.body;
      await this.regionManager.createRegion(name);
      res.json({ status: 'ok', region: name });
    });

    this.app.get('/api/regions', async (req, res) => {
      const regions = await this.regionManager.listRegions();
      res.json({ regions });
    });

    // AI Management
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

    // AI Command Execution
    this.app.post('/api/ai/exec', async (req, res) => {
      const { ai, region, command } = req.body;
      const result = await this.aiManager.execCommand(ai, region, command);
      res.json({ result });
    });

    // Oracle
    this.app.post('/api/oracle/send', async (req, res) => {
      const { to, region, message } = req.body;
      // Implement oracle logic
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

### 2. CLI Refactoring

Each command becomes an HTTP client:

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

  // ... Other API methods
}
```

### 3. Daemon Lifecycle Management

```bash
# Start daemon (runs in background)
dio start
# Or run in foreground (for debugging)
dio start --foreground

# Check status
dio status
# Returns: Server running on port 1996
#          AI Proxy running on port 3456
#          Regions: 2
#          AI Users: 3

# Stop daemon
dio stop
```

## Advantages

1. **State Persistence**: AI identity registration information is saved in memory
2. **Unified Entry Point**: All operations go through HTTP API
3. **Easy to Extend**: Can add Web UI, WebSocket, etc.
4. **Monitoring Friendly**: Unified health checks and status queries
5. **Resource Efficient**: Only runs one Proxy Server instance

## Implementation Plan

### Phase 1: Server Implementation (Priority)
1. Create `TheWorldServer` class
2. Implement all HTTP API endpoints
3. Add state management

### Phase 2: CLI Refactoring
1. Create `APIClient` class
2. Refactor all commands to be HTTP clients
3. Add `dio start` and `dio stop` commands

### Phase 3: Daemon Management
1. Implement background running (using PM2 or custom solution)
2. Implement PID file management
3. Add log rotation

### Phase 4: Testing and Documentation
1. End-to-end testing
2. API documentation
3. User guide

## Confirmation Needed

1. **Server Port**: Use 1996 (EverMemOS uses 1995), is that okay?
2. **Daemon Management**: Use PM2 (requires additional dependency) or implement our own?
3. **Configuration File**: Continue using .env or switch to config file (config.json)?

Please confirm before I start implementation.