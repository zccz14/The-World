# ADR-005: ClawHub Skills 集成

**状态**: 已接受  
**日期**: 2026-03-08  
**决策者**: TheWorld Team

## 背景

TheWorld 需要一个 Skill 生态系统，让 AI 可以扩展能力。有三个选择：

1. 自建 Skill 生态
2. 适配/翻译 OpenClaw Skills
3. 原生兼容 ClawHub

## 决策

选择**原生兼容 ClawHub**，在 Region 容器内预装 `clawhub` CLI。

## 理由

### 生态价值 > 技术差异

**历史教训**：Deno 因不兼容 npm 生态而发展受阻，最终妥协。

**TheWorld 的差异化**：

- Multi-Agent 架构
- 容器级隔离
- World Memory
- World Scheduler（规划中）

这些差异化价值不在 Skill 层面，因此无需自建生态。

### 用户画像：一人公司

- 经济优先：不浪费时间重复造轮
- 快速见效：立即可用的 Skills
- 专注价值：专注业务，不折腾工具

### 技术可行性

- ClawHub 提供标准 CLI 工具
- 容器内安装简单（npm install -g clawhub）
- 完全符合"宿主机零 Agentic"原则

## 实施

- Region 容器预装 `clawhub` CLI
- Skills 持久化在容器卷
- 不跨 Region 共享（简化设计）
- 不添加 `dio skill` 命令（AI 自己管理）

## 后果

**正面**：

- 立即获得成熟的 Skill 生态
- 零学习成本（标准 clawhub 命令）
- 社区驱动，持续更新

**负面**：

- 依赖外部生态（可接受，npm 也是外部生态）
- 每个 Region 独立管理（符合设计原则）

## 替代方案

**方案 A：自建生态**

- 优点：完全控制
- 缺点：投入巨大，生态从零开始

**方案 B：适配/翻译**

- 优点：可以定制
- 缺点：维护成本高，兼容性风险

## 参考

- [ClawHub](https://clawhub.ai)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [详细文档](../clawhub-integration.md)
