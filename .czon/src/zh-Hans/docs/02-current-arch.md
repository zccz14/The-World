# TheWorld 当前架构 (MVP v0.1)

**状态**: 迁移中（v0.1 → v0.2）  
**版本**: 0.1.0  
**最后更新**: 2026-03-10

## 概述

当前实现是一个精简的 MVP 版本，验证了核心概念的可行性。通过工程权衡，我们选择了简化的架构以加速开发和部署。

**v0.2 迁移方向**：从同步命令执行模型迁移到异步事件驱动模型，从临时任务执行迁移到常驻 Agent 服务。

## 设计意图与价值判断

本章节记录架构决策背后的核心价值判断，用于指导未来演进并防止走偏。

### 核心原则

1. **神谕是事件投递，不是 RPC 调用**
   - 任务本质是宽泛/重型，且可能多次返回、持续对话
   - 同步 `req/res` 语义天然不匹配长时任务与多轮交互
   - Agent 拥有回复主权：自主决定何时/是否/如何多次回复人类

2. **可观察性优先于低延迟**
   - serve-first 的核心价值是稳定的运行面，便于监控、治理、审计和运维
   - 常驻进程比临时执行更容易观察状态、限流、诊断和调度

3. **可靠投递优先于即时响应**
   - 失败策略："宁可慢，不可丢"
   - 支持可中断、可恢复、可审计、可追责
   - 消息天然留痕，方便复盘、合规、责任边界

4. **人类控制权最高**
   - 支持审批门禁、撤回/取消、优先级插队、重放复盘
   - 默认自动化执行，但保留人工干预能力
   - 所有行为必须可归因到 AI 身份与任务上下文

5. **单用户是 MVP 折中，不是终局**
   - 终局仍是多用户隔离（每个 AI 独立 Linux 用户）
   - 当前先守住"容器与宿主机隔离"安全边界
   - 架构必须保留可升级路径，不能锁死在单用户模型

6. **回复通道受控**
   - Agent 不能随意直写给人，必须通过受控 `Action`（tool/skill）申请"对人输出"
   - `/world/outbox` 写入应走 RegionDaemon 授权通道，防伪造、可审计
   - RegionDaemon 在受控写入成功后，主动通知 WorldServer；WorldServer 再转发到 UI/ChatApp

7. **默认假设可被攻陷（Assume Breach）**
   - 设计前提是工作负载可能出现 RCE，而不是假设容器天然安全
   - 安全目标是"容器失陷不等于宿主机失陷"
   - 运行时坚持最小权限：非 root、最小 capabilities、禁用特权与危险挂载
   - 具体基线由 ADR-007 约束，作为后续演进的硬边界

### 价值排序

```
可控性、可审计、可观察性 > 低延迟
可靠投递、可恢复 > 即时响应
能力完备性 > 资源节省
```

## 实际架构图

```
宿主机
│
├── ~/.the-world/                    # 数据存储
│   ├── audit/
│   │   └── world-memory-audit.jsonl # 审计层（宿主机长期累积）
│   └── regions/
│       └── <region-name>/
│           ├── shared/              # 共享文件（已挂载，未使用）
│           ├── inbox/               # 神谕投递（v0.2 主通道，迁移中）
│           └── outbox/              # AI 回复（v0.2 主通道，迁移中）
│
├── TheWorldServer (Node.js, 端口 3344)
│   ├── HTTP API Server
│   │   ├── GET  /health
│   │   ├── GET  /api/status
│   │   ├── POST /api/regions
│   │   ├── GET  /api/regions
│   │   ├── POST /api/ai
│   │   ├── GET  /api/ai
│   │   ├── POST /api/ai/speak
│   │   ├── POST /api/oracle/send (兼容别名，内部调用 speak)
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
│   ├── dio ai speak                 # 向 AI 发送消息（统一接口）
│   └── dio oracle send              # 发送神谕（兼容别名）
│
├── EverMemOS (外部依赖)
│   └── http://localhost:1995        # 世界记忆系统
│
└── Region 容器 (Docker)
    ├── GUI Desktop (webtop/noVNC)
    │   └── 浏览器入口 (:3000, 由宿主机随机映射并可被代理)
    │
    ├── RegionDaemon (Node.js)
    │   └── 控制服务器 (:62191)      # 命令执行、serve 管理
    │
    ├── agent 用户 (执行语义)
    │   ├── /home/agent/.opencode/config.json
    │   └── /home/agent/.config/opencode/opencode.jsonc
    │
    ├── abc 用户 (GUI 会话用户)
    │   └── /config
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
- 记录压缩工作记忆到 EverMemOS，并将完整审计写入宿主机

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
- 请求摘要记录到 EverMemOS，完整记录追加到宿主机审计层

**代码位置**: `src/proxy/AIProxyHandler.ts`

### 3. RegionDaemon (容器内守护进程)

**职责**:

- 管理常驻 opencode serve 进程（主执行平面）
- 提供受控的 outbox 写入通道（防伪造、可审计）
- 监听 outbox 变化并通知 WorldServer
- 执行维护命令（降级通道，以 agent 用户身份）

**端口**:

- 62191: 控制服务器 (与 World Server 3344 互补: 3344 | 62191 = 0xFFFF)

**设计原则（v0.2）**:

- **serve-first**：容器启动时自动启动 `opencode serve --port 4096`，作为主执行引擎
- **可观察性优先**：常驻进程便于监控状态、限流、诊断和调度
- **受控输出**：Agent 通过 tool/skill 申请写入 outbox，RegionDaemon 验证后写入并通知 WorldServer

**命令执行流程（维护通道）**:

```
TheWorldServer → RegionDaemonClient → curl → RegionDaemon (agent context) → sh -lc <cmd>
```

**当前实现状态（v0.1）**:

- ✅ 容器启动脚本已启动 `opencode serve --port 4096`
- ❌ 但主链路仍通过 `execute('agent', 'opencode run ...')` 临时执行
- ❌ serve 状态管理断裂：启动脚本的 serve 不在 `serveProcesses` 中
- ❌ outbox 监听与通知机制未实现

**代码位置**: `src/region-daemon/RegionDaemon.ts`, `docker/services/region-daemon`

### 4. Region 容器

**基础镜像**: `lscr.io/linuxserver/webtop:ubuntu-xfce`

**预装软件**:

- opencode-ai (全局安装)
- clawhub (全局安装)
- bash, sudo, git, curl

**用户配置**:

- `agent`：命令执行和 opencode 运行语义（兼容现有链路）
- `abc`：GUI 桌面会话用户（webtop 原生）
- 预配置 opencode 配置文件（`agent`）
- API 指向 `http://host.docker.internal:3344/v1`

**挂载点**:

- `/world/shared` - 共享目录（777 权限，未使用）
- `/world/inbox` - 神谕投递（v0.2 主通道，迁移中）
  - 格式：`oracle-{timestamp}-human-{aiName}.txt`
  - 权限：Agent 可读，通过 tool/skill 访问
- `/world/outbox` - AI 回复（v0.2 主通道，迁移中）
  - 格式：`response-{timestamp}.txt`
  - 权限：仅通过 RegionDaemon 受控写入（防伪造）

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

### AI 对话流程（统一 speakToAI 接口）

```
用户
  ↓ dio ai speak -t alpha -m "hello" 或 dio oracle send --to alpha --message "hello"
TheWorldServer (3344)
  ↓ POST /api/ai/speak (或 /api/oracle/send 兼容别名)
AIUserManager.speakToAI()
  ↓ 1. logIncomingMessage (记录入站消息到 EverMemOS + 审计层)
  ↓ 2. buildWakeupMemory (从 EverMemOS 召回相关记忆)
  ↓ 3. 写入 /home/agent/MEMORY.md
  ↓ 4. 构造 opencode run --file /home/agent/MEMORY.md
RegionDaemonClient
  ↓ docker exec <region> curl http://localhost:62191/execute
RegionDaemon (容器内)
  ↓ POST /execute
executeAsAgent(opencode run ...)
  ↓ opencode run --file /home/agent/MEMORY.md --attach http://localhost:4096
  ↓ AI 读取 MEMORY.md 中的召回记忆
  ↓ AI 生成回复
返回结果
  ↓ 5. extractTextFromOpencodeOutput (解析 JSON 输出)
  ↓ 6. logOutgoingMessage (记录出站消息到 EverMemOS + 审计层)
返回给用户
```

**关键特性**：

- 每次对话都强制召回记忆，确保上下文连续性
- 记忆写入 `/home/agent/MEMORY.md`，可审计、可调试
- 支持多源消息（human/ai/system）
- EverMemOS 不可用时降级，不阻断执行

### AI 调用 API 流程

```
容器内 agent 用户
  ↓ opencode run "hello"
读取 ~/.opencode/config.json
  ↓ apiKey: tw-alpha-xxx
  ↓ apiBaseUrl: http://host.docker.internal:3344/v1
TheWorldServer AI Proxy (3344/v1)
  ↓ 验证 dummy key
  ↓ 替换为真实 API Key
转发到真实 AI 服务
  ↓ https://api.openai.com/v1
返回响应
```

### 神谕流程（v0.2 目标模型）

**当前实现状态（v0.1.1）**：

- ✅ 统一 `speakToAI` 接口，所有消息走相同流程
- ✅ 强制记忆召回，每次对话前从 EverMemOS 检索相关上下文
- ✅ `/api/oracle/send` 作为兼容别名保留
- ⚠️ 仍为同步调用模型（等待 AI 回复后返回）
- ❌ inbox/outbox 异步模型未启用（计划 v0.2）

**v0.2 异步演进方向**：

```
用户
  ↓ dio oracle send --to alpha --message "hello"
TheWorldServer
  ↓ POST /api/oracle/send
  ↓ 生成 message_id，写入 /world/inbox/message-{id}.msg
  ↓ 记录到 EverMemOS + 宿主机审计层（状态: pending）
  ↓ 立即返回 message_id（不等待 AI 回复）

容器内 Agent (常驻 opencode serve)
  ↓ 通过 tool/skill 监听 inbox（或由 RegionDaemon 主动通知）
  ↓ 读取消息内容，召回记忆（与当前 speakToAI 流程一致）
  ↓ 自主决定处理策略
  ↓ 可能多次调用 "回复人类" tool/skill
  ↓ 每次回复写入 /world/outbox/response-{timestamp}.msg
  ↓ 通过 RegionDaemon 受控写入（防伪造、可审计）

RegionDaemon
  ↓ 监听 outbox 写入事件
  ↓ 通知 WorldServer（WebSocket/HTTP callback）

WorldServer
  ↓ 更新消息状态（processing → partial_response → completed）
  ↓ 转发到 UI/ChatApp/人类订阅通道
  ↓ 记录到 EverMemOS + 审计层

人类
  ↓ 通过 UI/CLI 查询消息状态与历史回复
  ↓ 可撤回未执行的消息
  ↓ 可重放已完成的消息
```

**设计语义**：消息是异步事件投递，不是同步 RPC 调用。核心记忆召回流程保持不变，只是传输层从同步 HTTP 改为异步文件。

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

✅ **核心功能（v0.1 稳定）**:

- Region 容器管理（创建、列出）
- AI 身份管理（注册、列出）
- 命令执行（同步调用，维护通道）
- API Key 隔离（Proxy 层）
- 分层记忆（EverMemOS 摘要层 + 宿主机审计层）
- GUI Desktop 支持（webtop/noVNC）

✅ **高级功能**:

- opencode serve 自动启动（容器启动时）
- opencode 实例代理（`/opencode/:region/*`）
- 健康检查和状态查询
- ClawHub Skills 原生集成

## 迁移中功能（v0.1 → v0.2）

🚧 **异步神谕机制**:

- ✅ inbox/outbox 目录已挂载
- ✅ 容器启动时已自动启动 `opencode serve --port 4096`
- ⚠️ 神谕仍为同步调用模型（待迁移）
- ❌ outbox 监听与通知机制（待实现）
- ❌ Agent "回复人类" tool/skill（待实现）
- ❌ oracle 状态查询接口（待实现）

🚧 **serve-first 执行模型**:

- ✅ serve 进程已常驻
- ❌ 主链路仍走临时 `opencode run`（待迁移到 attach）
- ❌ serve 状态管理断裂（启动脚本的 serve 不在 serveProcesses 中）

## 未实现功能

❌ **核心架构组件**:

- **异步神谕完整链路** ⭐ 迁移中
  - outbox 监听与通知
  - Agent 受控回复通道
  - oracle 状态机与查询接口
  - 撤回/取消/重放机制

- **World Scheduler（世界调度器）** ⭐ 关键缺失
  - 当前架构是完全被动响应式的
  - 缺少驱动 AI 自主性的核心机制
  - 无法实现 Heartbeat、任务队列、优先级调度
  - 详见 `docs/decisions/004-world-scheduler.md`

❌ **愿景功能**:

- 多用户隔离（当前为单一 agent 用户，终局目标）
- AI 投影机制
- Region 间通信
- Heartbeat 常驻机制（依赖 World Scheduler）
- AI 间进程通信
- 审批门禁与人工干预机制

## ClawHub Skills 集成

### 设计决策

TheWorld 选择**原生兼容** OpenClaw/ClawHub Skill 生态，而非自建或翻译：

**核心原因**：

1. **生态优先**：ClawHub 拥有成熟的 Skill 生态（4.6k+ stars，60k+ commits）
2. **避免 Deno 陷阱**：翻译/适配方案风险高，生态价值 > 技术差异
3. **一人公司原则**：快速见效，不重复造轮，专注差异化价值

**差异化价值**：

- Multi-Agent 原生架构
- 容器级安全隔离
- World Memory 统一记忆
- World Scheduler（规划中）

### 实现方式

**架构**：完全容器内管理

- Region 容器预装 `clawhub` CLI
- AI 直接使用标准 clawhub 命令
- Skills 持久化在容器卷（每个 Region 独立）
- 宿主机零 Agentic 逻辑（安全边界）

**网络**：容器直接访问 clawhub.ai  
**持久化**：`~/.the-world/regions/<region>/skills/` → `/home/agent/.openclaw/skills/`  
**共享**：不跨 Region 共享（简化设计）

详见：`docs/clawhub-integration.md` 和 `docs/decisions/005-clawhub-integration.md`

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

**v0.1 选择**: 同步 HTTP 调用

**理由**:

- 低延迟（无需文件轮询）
- 简化错误处理
- MVP 阶段快速验证

**v0.2 迁移方向**: 异步事件驱动

**迁移理由**:

- 任务本质是宽泛/重型，同步语义不匹配
- 支持多次回复与持续对话
- 可中断、可恢复、可审计
- Agent 拥有回复主权

**详见**: `docs/decisions/003-sync-oracle.md`（历史阶段决策，v0.2 已转向异步模型）

### 选择 4: GUI-first 默认 vs Headless-first 默认

**选择**: GUI-first 作为 Region 默认策略（实施中）

**理由**:

- 现实世界大量系统并非 API 优先，存在封闭 UI 流程
- 登录、验证码、人机验证等关键路径需要图形界面能力
- 能力完备性价值高于资源节省
- 默认应贴近真实用户系统能力，而不是理想化接口假设

**说明**:

- 当前 v0.1 实现仍以 headless Region 为主
- 已在 ADR-006 中确定向 GUI-first 迁移
- headless 保留为降级路径，不再作为默认立场

**详见**: `docs/decisions/006-gui-first-region.md`

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
- Region 容器: GUI-first 后基线内存高于 headless（取决于桌面会话与浏览器负载）
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
- `~/.the-world/audit/world-memory-audit.jsonl`: 宿主机审计层
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
