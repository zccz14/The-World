# TheWorld MVP 架构设计

## 项目概述

**项目名称**: TheWorld  
**NPM 包名**: the-world-ai  
**CLI 命令**: dio  
**Slogan**: The World is where AIs Collaborate and Shape Their World

### 核心理念

将宿主机视为一个"世界"，AI 作为这个世界中的"居民"。通过 Region 容器实现 AI 的隔离和协作，每个 AI 以独立 Linux 用户身份运行 opencode，通过代理服务器安全访问 AI API。

## 架构概览

```
宿主机
│
├── ~/.the-world/                 # 数据存储目录
│   ├── regions/
│   │   └── region-a/
│   │       ├── shared/           # 共享文件
│   │       ├── inbox/            # 神谕接收
│   │       └── outbox/           # AI 输出
│
├── the-world-ai (Node.js CLI + 代理服务器)
│   ├── dio start                    # 启动系统
│   ├── dio region:create            # 创建 Region 容器
│   ├── dio ai:create alpha          # 创建 AI 用户
│   ├── dio ai:exec alpha "cmd"      # 执行命令
│   └── 代理服务器 (:3456)            # AI API 请求转发
│
├── EverMemOS (已部署)
│   └── http://localhost:1995        # 世界记忆系统
│
└── Region-A (Docker 容器)
    ├── Socket Daemon (root)
    ├── opencode-ai (全局安装)
    ├── AI-alpha (Linux user)
    ├── AI-beta (Linux user)
    └── AI-gamma (Linux user)
```

## 核心组件

### 1. TheWorld CLI (宿主机运行)

**职责**：
- 管理系统生命周期（启动/停止）
- 创建和管理 Region 容器
- 创建和管理 AI 用户
- 提供 AI API 代理服务器
- 记录系统事件到 EverMemOS

**技术栈**：
- Node.js 18+
- TypeScript
- oclif (CLI 框架)
- dockerode (Docker API)
- express + http-proxy-middleware (代理服务器)

### 2. AI Proxy Server

**职责**：
- 验证 AI 身份（dummy key）
- 替换为真实 API Key
- 转发请求到真实 AI 服务
- 记录审计日志到 EverMemOS
- 防止 API Key 逃逸

**安全机制**：
- AI 只能访问 dummy key
- 代理服务器持有真实 API Key
- 所有请求记录到 EverMemOS（审计追踪）

### 3. Region 容器

**职责**：
- 提供 AI 隔离环境
- 运行 Socket Daemon（命令执行）
- 提供文件系统隔离
- 管理 AI 用户权限

**技术栈**：
- Node.js 20 Alpine
- opencode-ai (全局安装)
- Linux user 权限模型

### 4. Socket Daemon

**职责**：
- 监听多个 Unix socket（每个 AI 一个）
- 执行命令（以对应 AI 用户身份）
- 高性能命令执行（< 10ms 延迟）

### 5. EverMemOS 集成

**记忆类型**：
- `episodic_memory`: AI 对话历史
- `event_log`: 系统事件
- 自定义: 神谕记录、AI 间通信

**用途**：
- AI 意识/记忆存储
- 事件日志记录
- 审计追踪

## 数据流

### AI 执行 opencode 命令

```
用户 → dio ai:exec alpha "analyze code"
  → TheWorld CLI (宿主机)
    → Docker API
      → Region 容器
        → Socket Daemon
          → su - alpha -c "opencode analyze code"
            → opencode 读取 ~/.opencode/config.json
              → API Key: dummy-alpha-xxx
                → 发送请求到 http://host.docker.internal:3456/v1
                  → AI Proxy Server (宿主机)
                    → 验证 dummy key
                    → 替换为真实 API Key
                    → 转发到 https://api.openai.com/v1
                    → 记录审计日志到 EverMemOS
                      ← 返回响应
                    ← 返回给 opencode
                  ← 返回结果
                ← 输出结果
```

### 神谕流程

```
用户 → dio oracle:send --to alpha --message "hello"
  → TheWorld CLI
    → 记录到 EverMemOS
    → 写入 ~/.the-world/regions/region-a/inbox/oracle.msg
      → Region 容器
        → AI-alpha 监听 inbox
          → 读取神谕内容
            → 执行相应操作
```

## 安全模型

### 1. API Key 隔离

- **AI 视角**：只能看到 dummy key（`tw-alpha-123456`）
- **代理服务器**：持有真实 API Key，验证身份后转发
- **优势**：AI 无法逃逸获取真实 API Key

### 2. 文件系统隔离

- Linux user 权限模型
- AI-alpha 无法读取 AI-beta 的 `chmod 600` 文件
- 共享目录 `/world/shared`（777 权限）

### 3. 审计追踪

- 所有 AI API 请求记录到 EverMemOS
- 可追溯每个 AI 的行为历史

## 实现细节

### 项目结构

```
the-world-ai/
├── src/
│   ├── cli/                      # oclif CLI 命令
│   │   ├── commands/
│   │   │   ├── start.ts                  # 启动系统
│   │   │   ├── stop.ts                   # 停止系统
│   │   │   ├── status.ts                 # 查看状态
│   │   │   ├── oracle/send.ts            # 神谕
│   │   │   ├── region/
│   │   │   │   ├── create.ts             # 创建 Region
│   │   │   │   └── list.ts               # 列出 Region
│   │   │   └── ai/
│   │   │       ├── create.ts             # 创建 AI
│   │   │       ├── exec.ts               # 执行命令
│   │   │       └── list.ts               # 列出 AI
│   │   └── index.ts
│   │
│   ├── proxy/                            # AI API 代理服务器
│   │   └── AIProxyServer.ts              # 代理服务器主逻辑
│   │
│   ├── core/
│   │   ├── DockerManager.ts              # Docker API 封装
│   │   ├── RegionManager.ts              # Region 管理
│   │   └── AIUserManager.ts              # AI 用户管理
│   │
│   ├── memory/
│   │   ├── EverMemOSClient.ts
│   │   ├── MemoryManager.ts
│   │   └── types.ts
│   │
│   ├── region-daemon/
│   │   ├── daemon.ts
│   │   └── client.ts
│   │
│   └── utils/
│       ├── logger.ts
│       ├── config.ts
│       └── types.ts
│
├── docker/
│   ├── Dockerfile.region
│   └── init-scripts/
│       └── init-users.sh
│
├── dist/                         # 构建产物
├── bin/run                       # CLI 入口
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 关键命令

#### `dio start`
- 检查环境变量
- 验证 EverMemOS 连接
- 启动 AI Proxy Server（监听 :3456）

#### `dio region:create <name>`
- 构建 Region 镜像（如果不存在）
- 创建容器并挂载文件系统
- 启动 Socket Daemon

#### `dio ai:create <name>`
- 注册 AI 到代理服务器（生成 dummy key）
- 在容器内创建 Linux 用户
- 注入 opencode 配置（包含 dummy key）

#### `dio ai:exec <ai> <cmd>`
- 通过 Socket Daemon 执行命令
- 以 AI 用户身份运行

### 环境配置

```bash
# EverMemOS 配置
EVERMEMOS_URL=http://localhost:1995

# 真实 AI API Key（代理服务器使用）
REAL_AI_API_KEY=sk-xxxxxxxxxxxx

# AI 服务目标地址
AI_TARGET_BASE_URL=https://api.openai.com

# 代理服务器端口
AI_PROXY_PORT=3456

# TheWorld 数据存储路径（可选，默认为 ~/.the-world）
# WORLD_DATA_DIR=/custom/path/to/data
```

## 下一步

- [x] 实现项目结构
- [x] 实现 AI Proxy Server
- [ ] 实现 Region 容器构建（需测试）
- [ ] 实现 Socket Daemon（需测试）
- [ ] 实现 CLI 命令（需测试）
- [ ] 编写文档
- [ ] 发布到 npm

## 当前状态

✅ **已完成**：
1. 项目基础结构
2. TypeScript 配置
3. oclif CLI 框架
4. 核心代码实现：
   - AI Proxy Server（代理服务器）
   - EverMemOS 客户端
   - Docker 管理器
   - Region 管理器
   - AI 用户管理器
   - Socket Daemon
5. 所有 CLI 命令实现

🚧 **待测试**：
1. Region 容器构建（Docker 镜像）
2. Socket Daemon 实际运行
3. 完整的端到端流程
4. 与 EverMemOS 的集成

📝 **待完善**：
1. 错误处理
2. 日志优化
3. 配置验证
4. 单元测试
5. 文档完善
