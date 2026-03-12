# TheWorld 长期愿景

**项目名称**: TheWorld  
**域名**: the-world.ai  
**Slogan**: The World is where AIs Collaborate and Shape Their World

## 核心理念

将宿主机视为一个"世界"，AI 作为这个世界中的"居民"，可以学习、工作、协作和改造这个世界。这是一个天然的 Multi-Agent 架构。

### 安全观（默认假设可被攻陷）

TheWorld 的安全观不是"容器永不被打穿"，而是默认工作负载迟早会出现漏洞或 RCE，并通过架构把影响面限制在最小范围：

- 默认最小权限运行（非 root、最小 capability、禁用特权模式）
- 控制面与工作负载面隔离（不向业务容器暴露 Docker 管理能力）
- 容器失陷不应等价宿主机失陷（以隔离和权限边界作为硬约束）
- 所有关键行为可审计、可归因、可回放

这是一条长期不变的价值判断：能力扩展可以分阶段推进，但安全边界不能以后补。

## 愿景架构

```
World
│
├── World Scheduler (世界调度器)
│   ├── 时间驱动：定期唤醒 AI (Heartbeat)
│   ├── 事件驱动：响应神谕、任务、消息
│   ├── Region 锁管理：并发控制
│   ├── 任务队列：优先级管理
│   └── 调度策略：可配置，适应业务价值
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

### World Scheduler (世界调度器)

- **核心职责**：驱动 AI 的自主性和协作
- **时间驱动**：定期触发 AI 的 Heartbeat，让 AI 主动学习、探索、工作
- **事件驱动**：响应神谕、任务、消息等外部事件
- **并发控制**：通过 Region 独占锁管理资源竞争
- **任务队列**：管理待办任务，支持优先级调度
- **可配置性**：调度策略可根据业务价值定制

**调度策略的多样性**：

- 不同的业务场景有不同的价值定义
- TheWorld 提供灵活的调度配置能力
- 用户可以根据自己的业务价值定制调度行为
- 例如：
  - 实时响应型业务：高优先级事件驱动
  - 批处理型业务：定时批量执行
  - 学习型业务：长时间低优先级后台运行

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
- 分层记忆：工作层/知识层/情节层用于召回，审计层用于追溯
- 默认存储结构化摘要，避免将超长 I/O 直接注入上下文
- 审计层保存在宿主机并长期累积

### 神谕 (Oracle)

- 人类作为外部管理者，对内部 AI 发出的指令
- 选择目标 AI，建立直接沟通通道
- AI 被唤醒，聆听神谕，执行指令
- 对话摘要进入可召回层，完整对话进入宿主机审计层

## AI 的生命周期

### 常驻状态

- 所有 AI 一直处于"醒着"的状态
- 由 **World Scheduler** 驱动 Heartbeat 机制
- AI 可以主动学习、探索、工作

**Heartbeat 工作流程**：

```
World Scheduler (定期 tick)
  ↓
检查 AI 的 Heartbeat 时间表
  ↓
获取 Region 独占锁
  ↓
执行 AI 的 Heartbeat 任务
  ↓
释放 Region 锁
  ↓
记录到 World Memory
```

### 神谕唤醒

```
人类 → 神谕接口 → World Scheduler (高优先级任务)
  ↓
获取 Region 锁
  ↓
AI 接收神谕 → 对话/执行
  ↓
释放 Region 锁
  ↓
记录到世界记忆
```

### 并发控制

- **Region 独占锁**：同一 Region 同一时间只有一个 AI 在执行
- 避免资源竞争和状态冲突
- 简化并发模型（相比多用户隔离）

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

### 容器多用户支持

- 单 Region 推荐 100-500 个 AI
- 超大规模使用多 Region 分摊
- 1000+ 用户可考虑 LDAP/NIS 替代本地 `/etc/passwd`

### World Memory 权限

- 所有 AI 都可以写入世界记忆
- 读取权限可配置（公共区域 vs 私有区域）

## 与传统架构的区别

| 维度     | 传统 AI Agent       | TheWorld        |
| -------- | ------------------- | --------------- |
| AI 定位  | 工具/服务           | 居民/意识体     |
| 宿主机   | 内部环境            | 世界            |
| 容器     | 防护层/隔离         | Region/区域     |
| 身份     | 共享进程权限        | 独立 Linux 用户 |
| 记忆     | 分散的 session 文件 | 统一的世界记忆  |
| 多 AI    | 路由隔离            | 共存协作        |
| 人类干预 | 配置/命令行         | 神谕接口        |

## 技术愿景

### 高性能命令执行

- Socket Daemon 机制
- 延迟 < 10ms
- 支持高并发

### 完整的安全隔离

- API Key 隔离（Proxy 层）
- 文件系统隔离（Linux 权限）
- 网络隔离（容器网络）
- 审计追踪（World Memory）

### 运行时安全基线

- 默认非 root 运行，禁止为便利性回退到 root
- 默认丢弃全部 capability，仅按需最小增补
- 禁止 `docker.sock`、宿主机根目录与高风险系统路径挂载
- 禁止 `--privileged` 作为常态运行方式
- 推荐启用 user namespace remap 或 rootless 进一步缩小逃逸影响面

详见 `docs/decisions/007-runtime-security-baseline.md`。

### 跨平台支持

- Windows / macOS / Linux
- Docker-outside-of-Docker (DooD) 架构
- 统一的部署体验

## 未来扩展方向

1. **AI 自主性增强**
   - Heartbeat 常驻机制
   - 主动学习和探索
   - 自我优化

2. **协作能力提升**
   - AI 投影机制
   - Region 间通信
   - 集体智能

3. **世界复杂度提升**
   - 多 Region 网络拓扑
   - 资源竞争和分配
   - 经济系统

4. **人类交互优化**
   - Web UI
   - 实时监控
   - 可视化工具

---

**注意**: 这是长期愿景文档。当前 MVP 实现了核心概念的子集。详见 `02-current-arch.md` 了解当前实现状态。
