# TheWorld 当前架构 (MVP v0.1)

**状态**: 生产就绪  
**版本**: 0.1.0  
**最后更新**: 2026-03-08

## 概述

当前实现是一个精简的 MVP 版本，验证了核心概念的可行性。通过工程权衡，我们选择了简化的架构以加速开发和部署。

## 实际架构图

```
宿主机
│
├── ~/.the-world/                    # 数据存储
│   └── regions/
│       └── <region-name>/
│           ├── shared/              # 共享文件（已挂载，未使用）
│           ├── inbox/               # 神谕接收（已挂载，未使用）
│           └── outbox/              # AI 输出（已挂载，未使用）
│
├── TheWorldServer (Node.js, 端口 3344)
│   ├── HTTP API Server
│   │   ├── GET  /health
│   │   ├── GET  /api/status
│   │   ├── POST /api/regions
│   │   ├── GET  /api/regions
│   │   ├── POST /api/ai
│   │   ├── GET  /api/ai
│   │   ├── POST /api/ai/exec
│   │   ├── POST /api/oracle/send
│   │   ├── GET  /api/agent/:region/:user/status
│   │   ├── POST /api/agent/:region/:user/serve/start
│   │   ├── POST /api/agent/:region/:user/serve/stop
│   │   └── GET  /opencode/:region/*
│   │
│   └── AI Proxy (集成在同一服务)
│       └── /v1/*                    # 转发到真实 AI API
│
├── CLI (dio 命令)
│   ├── dio start                    # 启动 TheWorldServer
│   ├── dio stop                     # 停止 TheWorldServer
│   ├── dio status                   # 查看状态
│   ├── dio region create            # 创建 Region
│   ├── dio region list              # 列出 Region
│   ├── dio ai create                # 注册 AI 身份
│   ├── dio ai list                  # 列出 AI
│   ├── dio ai exec                  # 执行命令
│   └── dio oracle send              # 发送神谕
│
├── EverMemOS (外部依赖)
│   └── http://localhost:1995        # 世界记忆系统
│
└── Region 容器 (Docker)
    ├── RegionDaemon (Node.js)
    │   ├── 控制服务器 (:4040)       # 命令执行、serve 管理
    │   └── AI Proxy (:4041)         # 转发到宿主机 3344
    │
    ├── agent 用户 (单一用户)
    │   ├── /home/agent/.opencode/config.json
    │   └── /home/agent/.config/opencode/opencode.jsonc
    │
    └── 挂载点
        ├── /world/shared            # 共享目录
        ├── /world/inbox             # 神谕接收
        └── /world/outbox            # AI 输出
```

## 核心组件

### 1. TheWorldServer (统一服务)

**职责**:

- HTTP API 服务器（Region、AI 管理）
- AI Proxy（API Key 隔离和转发）
- 与 EverMemOS 集成
- 与 RegionDaemon 通信

**端口**: 3344（统一端口）

**关键特性**:

- 单一进程，简化部署
- 路径区分职责（`/api/*` vs `/v1/*`）
- 集成的健康检查和日志

**代码位置**: `src/server/TheWorldServer.ts`

### 2. AI Proxy Handler

**职责**:

- 验证 AI 身份（dummy key）
- 替换为真实 API Key
- 转发请求到真实 AI 服务
- 记录审计日志到 EverMemOS

**身份管理**:

```typescript
// AI 注册时生成 dummy key
const dummyKey = `tw-${aiName}-${Date.now()}`;

// 存储映射关系
aiIdentities.set(dummyKey, { aiName, dummyKey });
```

**安全机制**:

- AI 只能看到 dummy key
- 真实 API Key 只在 TheWorldServer 中
- 所有请求记录到 EverMemOS

**代码位置**: `src/proxy/AIProxyHandler.ts`

### 3. RegionDaemon (容器内守护进程)

**职责**:

- 执行命令（以 agent 用户身份）
- 管理 opencode serve 进程
- 代理 AI API 请求到宿主机

**端口**:

- 4040: 控制服务器
- 4041: AI Proxy

**命令执行流程**:

```
TheWorldServer → RegionDaemonClient → curl → RegionDaemon → su - agent -c <cmd>
```

**关键特性**:

- 同步执行，直接返回结果
- 支持超时控制
- 智能检测 `step_finish` 提前结束

**代码位置**: `src/region-daemon/RegionDaemon.ts`

### 4. Region 容器

**基础镜像**: `node:20-slim`

**预装软件**:

- opencode-ai (全局安装)
- bash, sudo, git, curl

**用户配置**:

- 单一 `agent` 用户
- 预配置 opencode 配置文件
- API 指向 `http://host.docker.internal:3344/v1`

**挂载点**:

- `/world/shared` - 共享目录（777 权限）
- `/world/inbox` - 神谕接收（未使用）
- `/world/outbox` - AI 输出（未使用）

**代码位置**: `docker/Dockerfile.region`

### 5. CLI 工具 (dio)

**框架**: oclif

**命令结构**:

```
dio
├── start                 # 启动 TheWorldServer（后台）
├── stop                  # 停止 TheWorldServer
├── status                # 查看状态
├── region
│   ├── create           # 创建 Region 容器
│   └── list             # 列出 Region
├── ai
│   ├── create           # 注册 AI（生成 dummy key）
│   ├── list             # 列出 AI
│   └── exec             # 执行命令
└── oracle
    └── send             # 发送神谕
```

**工作模式**: HTTP 客户端（调用 TheWorldServer API）

**代码位置**: `src/cli/commands/`

## 数据流

### AI 执行命令流程

```
用户
  ↓ dio ai exec alpha "ls -la"
TheWorldServer (3344)
  ↓ POST /api/ai/exec
AIUserManager
  ↓ execCommand(aiName, region, command)
RegionDaemonClient
  ↓ docker exec <region> curl http://localhost:4040/execute
RegionDaemon (容器内)
  ↓ POST /execute
executeAsUser('agent', command)
  ↓ su - agent -c <script>
执行命令
  ↓ stdout/stderr
返回结果
```

### AI 调用 API 流程

```
容器内 agent 用户
  ↓ opencode run "hello"
读取 ~/.opencode/config.json
  ↓ apiKey: tw-alpha-xxx
  ↓ apiBaseUrl: http://host.docker.internal:3344/v1
RegionDaemon AI Proxy (4041)
  ↓ 转发到宿主机
TheWorldServer AI Proxy (3344/v1)
  ↓ 验证 dummy key
  ↓ 替换为真实 API Key
转发到真实 AI 服务
  ↓ https://api.openai.com/v1
返回响应
```

### 神谕流程

```
用户
  ↓ dio oracle send --to alpha --message "hello"
TheWorldServer
  ↓ POST /api/oracle/send
记录到 EverMemOS
  ↓
RegionDaemonClient
  ↓ execute('agent', 'opencode run "hello" --format json')
RegionDaemon
  ↓ 执行命令
解析 JSON 输出
  ↓ 提取 response
返回给用户
```

## 配置管理

### 环境变量 (.env)

```bash
# EverMemOS
EVERMEMOS_URL=http://localhost:1995

# AI API
REAL_AI_API_KEY=sk-xxx
AI_TARGET_BASE_URL=https://api.openai.com/v1
REAL_AI_MODEL=claude-opus-4-6-thinking

# TheWorld Server
SERVER_PORT=3344

# EverMemOS 配置
LLM_API_KEY=sk-xxx
VECTORIZE_API_KEY=vz-xxx

# 数据目录（可选）
WORLD_DATA_DIR=~/.the-world
```

**代码位置**: `src/utils/config.ts`

## 已实现功能

✅ **核心功能**:

- Region 容器管理（创建、列出）
- AI 身份管理（注册、列出）
- 命令执行（同步调用）
- 神谕（直接调用 opencode）
- API Key 隔离（Proxy 层）
- 审计日志（EverMemOS）

✅ **高级功能**:

- opencode serve 管理（启动、停止、状态查询）
- opencode 实例代理（`/opencode/:region/*`）
- 健康检查和状态查询

## 未实现功能

❌ **愿景功能**:

- 多用户隔离（当前为单一 agent 用户）
- AI 投影机制
- Region 间通信
- Heartbeat 常驻机制
- 文件系统消息传递（inbox/outbox）
- AI 间进程通信

## 工程权衡

### 选择 1: 单用户 vs 多用户

**选择**: 单一 `agent` 用户

**理由**:

- 简化部署（无需动态创建用户）
- 降低复杂度（无需管理用户权限）
- Proxy 层已提供身份隔离
- MVP 阶段足够

**详见**: `docs/decisions/001-single-user.md`

### 选择 2: 统一端口 vs 分离端口

**选择**: 单一端口 3344

**理由**:

- 简化配置（只需管理一个端口）
- 简化部署（无需多个服务）
- 路径区分职责已足够清晰

**详见**: `docs/decisions/002-unified-port.md`

### 选择 3: 同步调用 vs 异步消息

**选择**: 同步 HTTP 调用

**理由**:

- 低延迟（无需文件轮询）
- 简化错误处理
- MVP 阶段无需异步解耦

**详见**: `docs/decisions/003-sync-oracle.md`

## 性能特性

### 命令执行延迟

- RegionDaemon 内部执行: ~2-5ms
- 通过 docker exec + curl: ~50-100ms
- 总体可接受

### 并发能力

- TheWorldServer: 单进程，Node.js 异步 I/O
- RegionDaemon: 单进程，支持多个并发请求
- 实际测试: 50 并发请求 < 1 秒

### 资源占用

- TheWorldServer: ~50MB 内存
- Region 容器: ~100MB 内存（基础）
- 每个 opencode serve: ~50MB 内存

## 部署要求

### 宿主机

- Node.js 18+
- Docker 20.10+
- 可用端口: 3344

### 外部依赖

- EverMemOS (http://localhost:1995)
- AI API 服务（OpenAI / Anthropic / 自定义）

### 存储

- `~/.the-world/`: 数据目录
- `~/.the-world/regions/<name>/`: 每个 Region 的数据
- `~/.the-world/server.pid`: 服务器 PID
- `~/.the-world/server.log`: 服务器日志

## 监控和调试

### 健康检查

```bash
curl http://localhost:3344/health
# {"status":"healthy","timestamp":...}
```

### 状态查询

```bash
curl http://localhost:3344/api/status
# {"status":"ok","regions":2,"aiIdentities":3,"uptime":...}
```

### 日志位置

- TheWorldServer: `~/.the-world/server.log`
- RegionDaemon: `docker logs <region-name>`

## 下一步

参见 `docs/04-roadmap.md` 了解未来规划。

---

**注意**: 这是当前实现的准确描述。与长期愿景的差异是有意为之的工程权衡，详见 `docs/decisions/` 目录。
