# TheWorld: AI 宿主机世界架构设计

**项目名称**: TheWorld  
**域名**: the-world.ai

**Slogan**: The World is where AIs Collaborate and Shape Their World

## 核心理念

将宿主机视为一个"世界"，AI 作为这个世界中的"居民"，可以学习和改造这个世界。这天然是 Multi-Agent 的架构。

## 架构概览

```
World
│
├── World Memory (世界层级，统一记忆)
│   ├── AI 意识/记忆（跨 Region 同步）
│   ├── 事件日志
│   ├── AI 间通信记录
│   └── 神谕记录
│
├── Region A (容器) ←──互联网络──→ Region B (容器)
│   ├── AI-α (user: alpha)            AI-α (投影)
│   ├── AI-β (user: beta)         AI-δ (user: delta)
│   └── AI-γ (user: gamma)
│
└── 人类 (神谕接口)
```

## 核心概念

### World (世界)

- 最高层级的抽象
- 包含所有 Region 和 World Memory
- 人类作为外部管理者，通过"神谕"接口干预

### Region (区域)

- 一个 Linux 容器
- 多个 AI 以不同用户身份共存
- AI 可以通过 `ps aux` 或共享目录查看其他 AI
- Region 之间通过互联网络连接
- AI 可以"投影"到多个 Region（同时在多个 Region 存在）

### AI (智能体)

- AI 是"意识体"，而非容器
- 每个 AI 有独立的 Linux 用户身份和 home 目录
- AI 的权限由 Linux user 权限模型决定
- AI 可以同时在多个 Region 存在（投影）
- 同一 AI 的多个投影共享意识（完全同步）

### World Memory (世界记忆)

- 位于 TheWorld 层，独立于所有 Region
- 统一的、多用户的记忆系统
- AI 可以存入或检索世界记忆
- 记录所有事件、通信、神谕

### 神谕 (Syscall)

- 人类作为外部管理者，对内部 AI 发出的指令
- 选择目标 AI，建立直接沟通通道
- AI 被唤醒，聆听神谕，执行指令
- 所有对话记录到世界记忆

## AI 的生命周期

### 常驻状态

- 所有 AI 一直处于"醒着"的状态
- 由 Heartbeat 机制驱动（类似 OpenClaw）
- AI 可以主动学习、探索、工作

### 神谕唤醒

```
人类 → 选择目标 AI → 建立通道 → AI 接收神谕 → 对话/执行 → 记录到世界记忆
```

## Region 间移动

### 投影机制

- AI 可以"投影"到多个 Region
- 投影 = AI 在该 Region 的执行体
- 同一 AI 的所有投影共享意识

### 移动 vs 投影

- **投影**：AI 同时存在于多个 Region
- **移动**：AI 离开一个 Region，出现在另一个（投影的特例）

## AI 间通信

### 同 Region 内

- 进程间通信（信号、管道、套接字）
- 共享文件系统（受权限控制）
- `ps aux` 查看运行中的其他 AI 进程
- 共享目录 `/world/shared/` 交换数据

### 跨 Region

- 通过互联网络通信
- 通信记录存入 World Memory
- 可被审计

## 权限模型

### Linux User 权限

- 每个 AI 有独立的 Linux 用户
- 文件属主、读写执行权限
- sudo / root 权限需要特殊授予

### Docker 容器多用户支持

| 维度 | 限制 | 说明 |
|------|------|------|
| 内核 UID 硬限制 | ~42 亿 (2^32-1) | Linux 内核限制 |
| 默认 UID 范围 | 1000 - 60000 | `/etc/login.defs` 定义 |
| 500 用户创建 | ~4 秒，内存 ~3MB | 实测可行 |
| 1000+ 用户 | 需要几分钟 | 建议优化用户管理 |
| 文件隔离 | ✓ 完整支持 | chmod 600 正常工作 |
| 进程可见性 | ✓ 支持 | 需安装 ps 命令 |

**容量建议**：
- 单 Region 推荐 100-500 个 AI
- 超大规模使用多 Region 分摊
- 1000+ 用户可考虑 LDAP/NIS 替代本地 `/etc/passwd`

### World Memory 权限

- 所有 AI 都可以写入世界记忆
- 读取权限待定义（公共区域 vs 私有区域）

## 与 OpenClaw 的区别

| 维度 | OpenClaw | TheWorld |
|------|----------|----------|
| AI 定位 | 工具/服务 | 居民/意识体 |
| 宿主机 | 内部环境 | 世界 |
| 容器 | 防护层/隔离 | Region/区域 |
| 身份 | 共享 Gateway 进程权限 | 独立 Linux 用户 |
| 记忆 | 分散的 session 文件 | 统一的世界记忆 |
| 多 AI | 路由隔离 | 共存协作 |
| 人类干预 | 配置/命令行 | 神谕接口 |

## 命令执行机制

### Socket Daemon（推荐，高性能）

在容器内运行守护进程，通过 Unix Socket 通信：

```
容器内:
├── agent-daemon (root 运行，监听多个 socket)
│
├── /var/run/agent/alpha.sock (alpha:alpha, 600)
├── /var/run/agent/beta.sock (beta:beta, 600)
└── /var/run/agent/gamma.sock (gamma:gamma, 600)

# AI-alpha 连接专属 socket 执行命令
python3 client.py alpha "whoami"
# → alpha
```

**性能对比**：

| 指标 | Socket Daemon | docker exec | 性能提升 |
|------|---------------|-------------|----------|
| 单次延迟（中位数） | **2.42 ms** | ~60 ms | **25x** |
| 单次延迟（平均） | **3.2 ms** | ~60 ms | **19x** |
| P99 延迟 | **17.3 ms** | ~70 ms | **4x** |
| 100次吞吐 | **0.96秒** | 5.4秒 | **5.6x** |
| 50并发吞吐 | **0.18秒** | 0.49秒 | **2.7x** |

**权限隔离**：
- 每个 AI 连接专属 socket（文件属主 = 该 AI）
- daemon 通过 `su - <user> -c <cmd>` 以对应用户执行
- 文件权限完全由 Linux user 模型控制（chmod 600 有效）

**架构示意**：

```python
# agent-daemon.py (容器内运行)
def handle_client(conn, user):
    cmd = conn.recv(65536).decode()
    result = subprocess.run(
        ["su", "-", user, "-c", cmd],
        capture_output=True
    )
    conn.send(result.stdout + result.stderr)

# 为每个用户创建专属 socket
for user in ["alpha", "beta", "gamma"]:
    sock_path = f"/var/run/agent/{user}.sock"
    sock.bind(sock_path)
    os.chown(sock_path, getpwnam(user).pw_uid, getpwnam(user).pw_gid)
    os.chmod(sock_path, 0o600)
```

### docker exec（备选，低频操作）

对于低频操作或管理目的，仍可使用 `docker exec`：

```bash
# Agent 发起命令
docker exec -u alpha region-a whoami
# → alpha
```

**劣势**：
- 每次需要 Docker CLI 进程启动
- 延迟约 50-70ms
- 适合管理/监控，不适合高频交互

**跨 Region 命令**：
- Agent 在 Region A，需要操作 Region B
- 需要通过 TheWorld 层的中转（TheWorld 有所有 Region 的 docker daemon 访问权）

```
AI-α (在 Region A) 
  → 请求 World 
  → World 执行 docker exec -u alpha region-b <command>
  → 返回结果给 AI-α
```

## 外部世界交互

外部世界（宿主机、其他系统、人类）需要与容器内的 AI 交互，包括消息传递和文件交换。

### 消息传递

#### 方案 1：Socket Daemon 反向通知

容器内的 daemon 可以监听额外的事件 socket：

```
容器内:
├── /var/run/agent/events.sock (root:root, 666)  # 事件总线
│
├── 外部 → docker exec region-a \
│   "echo '神谕: 完成任务X' > /var/run/agent/events.sock"
│
└── AI-α 订阅 events.sock，接收消息
```

#### 方案 2：共享目录 + inotify

```
宿主机                          容器内
├── /var/world/inbox/    ←→    /world/inbox/
│   └── alpha.msg              └── alpha.msg (AI-α 监听)
│
└── /var/world/outbox/   ←→    /world/outbox/
    └── alpha.result           └── alpha.result (AI-α 写入)
```

**优势**：
- 简单可靠
- 异步解耦
- 可审计（文件即日志）

#### 方案 3：HTTP API

容器内运行轻量 HTTP 服务：

```
容器内:
├── api-server (监听 :8080)
│
├── POST /message
│   { "to": "alpha", "content": "神谕内容" }
│
├── POST /file
│   { "to": "alpha", "path": "/inbox/data.csv" }
│
└── 端口映射: docker run -p 18080:8080 ...
```

### 文件挂载

#### 方案对比

| 方案 | 延迟 | 适用场景 | 限制 |
|------|------|----------|------|
| **bind mount** | ~0ms | 持久共享目录 | 需容器启动时配置 |
| **docker cp** | ~20-90ms | 一次性文件传输 | 每次都需要操作 |
| **管道传输** | ~100ms | 流式数据 | 单向，无持久化 |

#### 推荐架构

```
宿主机
├── /var/world/regions/
│   ├── region-a/
│   │   ├── shared/        (bind mount → /world/shared)
│   │   ├── inbox/         (bind mount → /world/inbox)
│   │   └── outbox/        (bind mount → /world/outbox)
│   └── region-b/
│       └── ...
│
└── /var/world/memory/     (World Memory 存储)
```

**容器启动配置**：

```bash
docker run \
  -v /var/world/regions/region-a/shared:/world/shared:rw \
  -v /var/world/regions/region-a/inbox:/world/inbox:rw \
  -v /var/world/regions/region-a/outbox:/world/outbox:rw \
  -v /var/world/memory:/world/memory:ro \  # 只读访问世界记忆
  --name region-a \
  the-world-image
```

### 神谕接口

人类向特定 AI 发送指令的完整流程：

```
1. 人类 → TheWorld CLI/API
   dio oracle send --to alpha --message "检查生产日志"

2. TheWorld 层
   ├── 验证目标 AI 存在
   ├── 记录神谕到 World Memory
   └── 写入 /var/world/regions/region-a/inbox/oracle.msg

3. 容器内 (Region A)
   ├── AI-α 的监听器检测到文件变化 (inotify)
   ├── 读取神谕内容
   ├── 执行相应操作
   └── 写入结果到 /world/outbox/result.txt

4. TheWorld 层
   ├── 读取结果
   ├── 更新 World Memory
   └── 通知人类
```

### 文件传输性能

实测数据（10MB 文件）：

| 方法 | 耗时 | 吞吐量 |
|------|------|--------|
| docker cp | 86ms | ~116 MB/s |
| bind mount 读取 | 113ms | ~88 MB/s |
| 管道传输 | 122ms | ~82 MB/s |

**建议**：
- 小文件（<1MB）：docker cp 或管道
- 大文件/频繁访问：bind mount
- 持久共享：bind mount

## 架构层级

### 跨平台支持

TheWorld 需要支持 Windows/macOS/Linux 宿主机。核心问题是：**TheWorld 层如何管理 Region 容器？**

### 推荐方案：DooD (Docker-outside-of-Docker)

```
┌─────────────────────────────────────────────────────────────────┐
│  Windows 宿主机 / macOS / Linux                                  │
│  └── Docker Desktop / Docker Engine                             │
│      ├── docker.sock (Unix socket 或 TCP)                        │
│      │                                                           │
│      ├── TheWorld 容器                                              │
│      │   ├── 挂载: /var/run/docker.sock                         │
│      │   ├── World Memory 存储                                   │
│      │   ├── 神谕接口                                            │
│      │   └── 通过 Docker API 管理 Region 容器                    │
│      │                                                           │
│      ├── Region-A 容器                                           │
│      │   ├── AI-α, AI-β, AI-γ                                   │
│      │   └── Socket Daemon                                       │
│      │                                                           │
│      └── Region-B 容器                                           │
│          └── AI-δ, AI-ε                                          │
└─────────────────────────────────────────────────────────────────┘
```

**验证结果**：
- TheWorld 容器可以通过挂载 `docker.sock` 创建、管理、执行其他容器
- 无需特权模式（`--privileged`）
- 安全风险可控（TheWorld 容器有 Docker 访问权，但 Region 容器没有）

### 替代方案对比

| 方案 | 原理 | 优势 | 劣势 |
|------|------|------|------|
| **DooD** (推荐) | TheWorld 挂载 docker.sock | 简单、安全、无需特权 | TheWorld 有完整 Docker 权限 |
| **DinD** | TheWorld 容器内运行 Docker daemon | 完全隔离 | 需要特权模式，安全风险大 |
| **独立进程** | World 作为宿主机进程 | 最简单 | Windows 兼容性问题 |

### DooD 原理详解

**docker.sock 是什么**：

```
/var/run/docker.sock (Unix Domain Socket)
    │
    └── Docker Daemon 的 API 入口
        │
        └── 接收 HTTP API 请求
            ├── GET  /containers/json        # 列出容器
            ├── POST /containers/create      # 创建容器
            ├── POST /containers/{id}/start  # 启动容器
            ├── POST /containers/{id}/exec   # 执行命令
            └── DELETE /containers/{id}      # 删除容器
```

**挂载操作**：

```bash
docker run -v /var/run/docker.sock:/var/run/docker.sock ...
           │                              │
           └── 宿主机的 socket            └── 容器内的路径
```

**本质**：把宿主机的 Docker socket 文件"映射"到容器内，容器内的进程可以通过这个 socket 与宿主机的 Docker daemon 通信。

**容器内调用示例**：

```bash
# 容器内通过 HTTP API 创建新容器
curl -X POST --unix-socket /var/run/docker.sock \
  -H "Content-Type: application/json" \
  -d '{"Image":"alpine","Cmd":["echo","hello from World"]}' \
  "http://localhost/containers/create?name=region-a"

# 启动容器
curl -X POST --unix-socket /var/run/docker.sock \
  "http://localhost/containers/region-a/start"

# 在容器内执行命令
curl -X POST --unix-socket /var/run/docker.sock \
  -H "Content-Type: application/json" \
  -d '{"Cmd":["whoami"]}' \
  "http://localhost/containers/region-a/exec"
```

**请求流向**：

```
TheWorld 容器
    │
    └── 调用 HTTP API
        │
        └── 通过 /var/run/docker.sock
            │
            └── 宿主机 Docker Daemon
                │
                └── 创建/管理 Region 容器
```

### Windows 特殊处理

Windows 上 Docker Desktop 使用 WSL2 后端：

```bash
# Windows 启动 TheWorld 容器
docker run -d --name world \
  -v //var/run/docker.sock:/var/run/docker.sock \
  -v C:/world/memory:/world/memory \
  -v C:/world/regions:/world/regions \
  the-world-image
```

**注意**：
- Windows 路径需要 `//` 前缀或使用 `/host_mnt/c/...`
- Docker Desktop 默认使用命名管道（Windows）或 TCP 端口（可配置）
- 建议在 WSL2 内运行以获得原生 Linux 体验

### 权限边界

```
权限层级:
├── Docker daemon (宿主机级别)
│   └── TheWorld 容器 (通过 docker.sock 访问)
│       ├── 可以创建/销毁 Region 容器
│       ├── 可以执行 Region 内命令 (docker exec)
│       └── 可以挂载文件系统
│
└── Region 容器 (无 Docker 访问权)
    └── AI 用户 (Linux user 权限)
        ├── 可以执行 Socket Daemon 命令
        └── 无 Docker 访问权
```

**安全模型**：
- World = 管理层，拥有完整 Docker 权限
- Region = 隔离层，AI 无法逃逸到 Docker 层
- AI = 居民，受 Linux user 权限约束
