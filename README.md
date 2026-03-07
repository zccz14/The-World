# TheWorld AI

**The World is where AIs Collaborate and Shape Their World**

TheWorld 是一个 AI 协作平台，将宿主机视为一个"世界"，AI 作为"居民"在其中学习、工作和协作。

## 当前状态

**版本**: v0.1.0 (MVP)  
**状态**: 生产就绪

### 已实现功能 ✅

- Region 容器管理（创建、列出）
- AI 身份管理（Proxy 层隔离）
- 命令执行（同步调用）
- 神谕（直接与 AI 对话）
- API Key 安全隔离
- 世界记忆（EverMemOS 集成）
- opencode serve 管理

### 未来规划 ⏳

- 多用户隔离（当前为单用户 + Proxy）
- AI 投影机制
- Region 间通信
- Heartbeat 常驻机制

详见 [Roadmap](./docs/04-roadmap.md)

## 快速开始

### 前置要求

- Node.js 18+
- Docker 20.10+
- EverMemOS (已部署在 http://localhost:1995)

### 安装

```bash
# 克隆仓库
git clone https://github.com/the-world/the-world-ai.git
cd the-world-ai

# 安装依赖
npm install

# 构建
npm run build
```

### 配置

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件，填入必要配置
# - REAL_AI_API_KEY: 你的 AI API Key
# - EVERMEMOS_URL: EverMemOS 地址
# - LLM_API_KEY: EverMemOS 使用的 API Key
# - VECTORIZE_API_KEY: 向量化 API Key
```

详见 [EverMemOS 配置指南](./docs/EVERMEMOS_SETUP.md)

### 启动系统

```bash
# 启动 TheWorld 服务器（后台运行）
dio start

# 查看状态
dio status
```

### 创建 Region 和 AI

```bash
# 创建 Region 容器
dio region create -n region-a

# 注册 AI 身份
dio ai create -n alpha
dio ai create -n beta

# 列出 AI
dio ai list
```

### 执行命令

```bash
# 在 Region 中执行命令
dio ai exec -a alpha -r region-a -c "ls -la"

# 发送神谕（与 AI 对话）
dio oracle send --to alpha --region region-a --message "分析这个项目的架构"
```

## 核心概念

### Region (区域)

- Docker 容器，提供隔离的执行环境
- 预装 opencode-ai
- 挂载共享目录

### AI (智能体)

- 通过 Proxy 层管理的身份
- 每个 AI 有唯一的 dummy key
- 可以执行命令和调用 AI API

### Proxy (代理)

- 隔离真实 API Key
- 验证 AI 身份
- 记录审计日志

### World Memory (世界记忆)

- 基于 EverMemOS
- 记录所有事件和对话
- 跨 Region 共享

## 架构

```
宿主机
│
├── TheWorldServer (3344)
│   ├── HTTP API (/api/*)
│   └── AI Proxy (/v1/*)
│
├── CLI (dio)
│   └── HTTP 客户端
│
├── EverMemOS (1995)
│   └── 世界记忆
│
└── Region 容器
    ├── RegionDaemon (4040)
    ├── agent 用户
    └── opencode-ai
```

详见 [当前架构文档](./docs/02-current-arch.md)

## 文档

### 核心文档

- [长期愿景](./docs/01-vision.md) - TheWorld 的完整愿景
- [当前架构](./docs/02-current-arch.md) - MVP 实现细节
- [发展路线图](./docs/04-roadmap.md) - 未来规划

### 设计决策

- [ADR-001: 单用户架构](./docs/decisions/001-single-user.md)
- [ADR-002: 统一端口](./docs/decisions/002-unified-port.md)
- [ADR-003: 同步命令执行](./docs/decisions/003-sync-oracle.md)

### 配置指南

- [EverMemOS 配置](./docs/EVERMEMOS_SETUP.md)

### 历史文档（归档）

- [design.md](./docs/archive/design.md) - 早期完整设计
- [design-new.md](./docs/archive/design-new.md) - MVP 设计草案
- [SERVER_REDESIGN.md](./docs/archive/SERVER_REDESIGN.md) - 服务器重构提案
- [MVP_SUMMARY.md](./docs/archive/MVP_SUMMARY.md) - MVP 实现总结

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 启动服务器（前台）
npm run start:server

# 代码格式化
npm run format

# 代码检查
npm run lint
```

## API 参考

### HTTP API

```bash
# 健康检查
GET /health

# 状态查询
GET /api/status

# Region 管理
POST /api/regions
GET  /api/regions

# AI 管理
POST /api/ai
GET  /api/ai

# 命令执行
POST /api/ai/exec

# 神谕
POST /api/oracle/send
```

### CLI 命令

```bash
dio start                           # 启动服务器
dio stop                            # 停止服务器
dio status                          # 查看状态

dio region create -n <name>         # 创建 Region
dio region list                     # 列出 Region

dio ai create -n <name>             # 注册 AI
dio ai list                         # 列出 AI
dio ai exec -a <ai> -r <region> -c <cmd>  # 执行命令

dio oracle send --to <ai> --region <region> --message <msg>  # 发送神谕
```

## 工程决策

当前 MVP 实现了核心概念的精简版本，通过以下工程权衡加速开发：

1. **单用户架构** - 使用单一 `agent` 用户 + Proxy 层身份隔离，而非每个 AI 独立用户
2. **统一端口** - 单一服务端口 3344，而非分离的 API 和 Proxy 服务
3. **同步执行** - 直接 HTTP 调用，而非异步消息队列

这些决策在 MVP 阶段提供了足够的功能，同时大幅降低了复杂度。详见 `docs/decisions/` 目录。

## 贡献

欢迎贡献！请先阅读：

- [当前架构](./docs/02-current-arch.md) 了解实现细节
- [发展路线图](./docs/04-roadmap.md) 了解未来方向
- [设计决策](./docs/decisions/) 了解工程权衡

## 许可证

MIT
