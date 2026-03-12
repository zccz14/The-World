# ClawHub Skills 集成

## 概述

TheWorld 通过原生兼容 OpenClaw/ClawHub Skill 生态，让 AI 可以使用社区的数千个 Skills，同时保持 TheWorld 的差异化价值。

## 为什么选择兼容 ClawHub？

### 生态价值 > 技术差异

**历史教训：Deno 的困境**

- Deno 技术上优于 Node.js（安全、TypeScript 原生）
- 但因不兼容 npm 生态，发展受阻
- 最终不得不妥协，支持 npm

**TheWorld 的选择**

- 我们有差异化价值（Multi-Agent、容器隔离、World Memory）
- 但不应该在 Skill 生态上重复造轮
- 原生兼容 ClawHub = 立即获得成熟生态

### 用户画像：一人公司

**核心需求**：

- 经济优先：不浪费时间重复造轮
- 快速见效：立即可用的 Skills
- 有架构理念：理解 Multi-Agent 价值
- 渴望实现价值：专注业务，不折腾工具

**兼容 ClawHub 的价值**：

- 零学习成本（AI 使用标准命令）
- 立即可用（数千个现成 Skills）
- 社区驱动（持续更新和维护）

## 架构设计

### 核心原则

1. **完全容器内管理**：所有 Skill 逻辑在 Region 容器内
2. **宿主机零 Agentic**：宿主机不参与任何 AI 决策
3. **原生兼容**：不翻译、不适配，直接使用 clawhub CLI

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│ 宿主机 (TheWorld Server)                                     │
│                                                              │
│  ~/.the-world/regions/<region>/skills/                      │
│    └── 纯存储，零逻辑                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓ 挂载
┌─────────────────────────────────────────────────────────────┐
│ Region Container                                             │
│                                                              │
│  预装软件：                                                  │
│    ├── opencode-ai                                          │
│    ├── clawhub CLI ⭐ 新增                                  │
│    └── node, python, curl, jq 等                           │
│                                                              │
│  /home/agent/.openclaw/skills/ ⭐ 持久化                    │
│    └── <author>/<skill-name>/                              │
│                                                              │
│  AI Agent 可以执行：                                         │
│    ├── clawhub search <query>                              │
│    ├── clawhub install <slug>                              │
│    ├── clawhub list                                        │
│    └── 直接使用 Skills (OpenClaw 原生方式)                 │
└─────────────────────────────────────────────────────────────┘
```

### 设计决策

| 决策点         | 选择             | 理由                              |
| -------------- | ---------------- | --------------------------------- |
| 管理位置       | 容器内           | 符合"宿主机零 Agentic"原则        |
| 网络访问       | 直接访问         | 简单，效率不是瓶颈                |
| 持久化         | 容器卷           | 每个 Region 独立，简化设计        |
| 跨 Region 共享 | 不共享           | 避免复杂性，用户不会用很多 Skills |
| CLI 集成       | 不添加 dio skill | AI 自己管理，减少维护成本         |

## 实施细节

### 修改文件

1. **docker/Dockerfile.region**
   - 添加 `npm install -g clawhub`
   - 创建 `/home/agent/.openclaw/skills/` 目录

2. **src/core/RegionManager.ts**
   - 添加 skills 目录挂载
   - 在 ensureDirectory 中创建 skills 目录

### 使用示例

```bash
# AI 自主搜索、安装和使用 Skills
dio ai speak -t alpha -r region-a \
  -m "Search for a calendar skill, install it, and show me how to use it"

# 或使用 oracle（兼容别名）
dio oracle send --to alpha --region region-a \
  --message "Find and install a calendar management skill, then check my schedule"
```

### 用户体验

**典型对话流程**：

```
用户: "帮我找一个管理日历的 skill"
AI: [执行 clawhub search calendar]
AI: "我找到了 steipete/calendar，要安装吗？"
用户: "安装"
AI: [执行 clawhub install steipete/calendar]
AI: "已安装，现在可以使用了"
```

## 与 OpenClaw 的差异

| 维度   | OpenClaw     | TheWorld                  |
| ------ | ------------ | ------------------------- |
| 定位   | 个人 AI 助手 | Multi-Agent 基础设施      |
| 架构   | 单一 Agent   | Multi-Agent + Region 容器 |
| 隔离   | 进程级       | 容器级                    |
| 记忆   | 本地文件     | World Memory (EverMemOS)  |
| Skills | 共享         | 每个 Region 独立          |
| 调度   | 被动响应     | World Scheduler（规划中） |

## 未来优化

**Phase 2（可选）**：

- 添加 `dio skill list` 只读命令（方便用户查看）
- 添加宿主机 ClawHub 缓存代理（提升性能）
- World Memory 记录 Skill 使用情况

**Phase 3（可选）**：

- 跨 Region Skill 推荐（基于使用频率）
- Skill 安全扫描

## 参考资源

- [ClawHub 官网](https://clawhub.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [Skills 仓库](https://github.com/openclaw/skills)
- [ClawHub 文档](https://github.com/openclaw/clawhub)
