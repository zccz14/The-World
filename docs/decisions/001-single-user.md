# ADR-001: 使用单一 agent 用户而非多用户隔离

## 状态

已采纳

## 日期

2026-03-08

## 背景

长期愿景（`docs/01-vision.md`）设想每个 AI 有独立的 Linux 用户（alpha, beta, gamma），实现完整的 OS 级别隔离：

```
Region 容器
├── AI-alpha (user: alpha, uid: 1001)
├── AI-beta (user: beta, uid: 1002)
└── AI-gamma (user: gamma, uid: 1003)
```

这种设计的优势：

- 完整的文件系统隔离（chmod 600 有效）
- 进程隔离（ps aux 可见但无法干预）
- 符合 Unix 哲学
- 真正的多租户架构

但在 MVP 阶段，这带来了显著的复杂度：

- 需要动态创建用户（useradd）
- 需要为每个用户注入配置文件
- 需要管理用户权限和 home 目录
- 容器启动时间增加
- 调试和维护成本增加

## 决策

MVP 阶段使用单一 `agent` 用户，通过 Proxy 层的 dummy key 实现身份隔离。

**实现方式**：

1. 容器构建时创建单一 `agent` 用户
2. 预配置 opencode 配置文件
3. 所有命令以 `agent` 用户身份执行
4. 通过 AIProxyHandler 的 dummy key 区分不同 AI

```typescript
// AI 注册时生成唯一 dummy key
const dummyKey = `tw-${aiName}-${Date.now()}`;
aiIdentities.set(dummyKey, { aiName, dummyKey });

// 所有 AI 共享 agent 用户，但使用不同的 dummy key
```

## 理由

### 1. 简化部署

- 无需动态用户管理
- 容器镜像预配置即可
- 启动时间 < 2 秒

### 2. 降低复杂度

- 减少 50% 的用户管理代码
- 避免权限问题的调试
- 简化配置注入流程

### 3. 安全性足够

- Proxy 层已提供身份隔离
- API Key 无法逃逸（dummy key 机制）
- 审计日志记录所有操作
- MVP 阶段不需要文件级别隔离

### 4. 性能优势

- 无需为每个 AI 创建用户
- 减少容器内的资源占用
- 简化命令执行流程

## 后果

### 正面影响

✅ 部署复杂度大幅降低  
✅ 开发速度提升 3-5 倍  
✅ 维护成本降低  
✅ 容器启动速度提升

### 负面影响

⚠️ 放弃了 OS 级别的文件权限隔离  
⚠️ 所有 AI 可以读取彼此的文件  
⚠️ 无法使用 Linux 权限模型进行访问控制

### 风险缓解

- Proxy 层提供 API 级别的身份隔离
- EverMemOS 记录所有操作，可审计
- 未来可以通过容器级别隔离（每个 AI 独立容器）实现更强隔离

## 未来考虑

如果需要真正的文件隔离，有两种演进路径：

### 路径 1: 动态多用户

```typescript
async createAI(aiName: string, regionName: string) {
  // 1. 在容器内创建用户
  await execInContainer(region, `useradd -m -s /bin/bash ${aiName}`);

  // 2. 注入配置
  await injectConfig(region, aiName, dummyKey);

  // 3. 执行命令时使用对应用户
  await execAsUser(region, aiName, command);
}
```

**优势**: 保持单容器多 AI 架构  
**劣势**: 增加复杂度，需要重构

### 路径 2: 容器级别隔离

```
Region-A
├── AI-alpha 容器
├── AI-beta 容器
└── AI-gamma 容器
```

**优势**: 最强隔离，简化用户管理  
**劣势**: 资源占用增加，网络复杂度增加

## 相关决策

- ADR-002: 统一端口架构
- ADR-003: 同步命令执行

## 参考

- `src/core/AIUserManager.ts:19-24` - AI 创建实现
- `docker/Dockerfile.region:14-22` - agent 用户配置
- `src/proxy/AIProxyHandler.ts:84-89` - dummy key 机制
