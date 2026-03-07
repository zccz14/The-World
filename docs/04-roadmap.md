# TheWorld 发展路线图

**当前版本**: v0.1.0 (MVP)  
**最后更新**: 2026-03-08

## 版本规划

### v0.1.0 - MVP ✅ (当前)

**目标**: 验证核心概念，实现基础功能

**已完成**:

- ✅ Region 容器管理
- ✅ AI 身份管理（Proxy 层）
- ✅ 命令执行（RegionDaemon）
- ✅ 神谕（同步调用）
- ✅ API Key 隔离
- ✅ EverMemOS 集成
- ✅ opencode serve 管理

**工程决策**:

- 单用户架构（agent）
- 统一端口（3344）
- 同步命令执行

---

### v0.2.0 - 稳定性和可观测性 🎯

**目标**: 提升生产可用性，增强监控和调试能力

**计划功能**:

#### 1. 完善的日志系统

- [ ] 结构化日志（JSON 格式）
- [ ] 日志级别控制（DEBUG/INFO/WARN/ERROR）
- [ ] 日志轮转和归档
- [ ] 集中式日志收集

#### 2. 监控和指标

- [ ] Prometheus metrics 端点
- [ ] 关键指标：
  - 命令执行延迟
  - API 请求成功率
  - Region 健康状态
  - AI 活跃度
- [ ] Grafana 仪表板模板

#### 3. 错误处理优化

- [ ] 统一的错误码体系
- [ ] 详细的错误信息
- [ ] 自动重试机制
- [ ] 优雅降级

#### 4. 健康检查增强

- [ ] Region 容器健康检查
- [ ] RegionDaemon 健康检查
- [ ] EverMemOS 连接检查
- [ ] AI API 可用性检查

#### 5. 配置验证

- [ ] 启动时配置验证
- [ ] 配置热重载
- [ ] 配置模板和示例

**预计时间**: 2-3 周

---

### v0.3.0 - 多用户隔离 🔒

**目标**: 实现真正的 OS 级别隔离

**计划功能**:

#### 1. 动态用户管理

```typescript
async createAI(aiName: string, regionName: string) {
  // 1. 在容器内创建用户
  await execInContainer(region, `useradd -m -s /bin/bash ${aiName}`);

  // 2. 注入 opencode 配置
  await injectConfig(region, aiName, dummyKey);

  // 3. 设置权限
  await setupPermissions(region, aiName);
}
```

#### 2. 文件系统隔离

- [ ] 每个 AI 独立的 home 目录
- [ ] 文件权限控制（chmod 600）
- [ ] 共享目录权限管理

#### 3. 进程隔离

- [ ] 命令以对应 AI 用户执行
- [ ] 进程可见性控制
- [ ] 资源限制（cgroup）

#### 4. 迁移工具

- [ ] 从单用户迁移到多用户
- [ ] 数据迁移脚本
- [ ] 兼容性层

**工程挑战**:

- 动态用户创建的复杂度
- 配置注入的可靠性
- 性能影响评估

**预计时间**: 3-4 周

---

### v0.4.0 - AI 协作能力 🤝

**目标**: 实现 AI 间通信和协作

**计划功能**:

#### 1. AI 间消息传递

```typescript
// AI-alpha 发送消息给 AI-beta
await sendMessage({
  from: 'alpha',
  to: 'beta',
  region: 'region-a',
  content: '请帮我分析这个日志',
});
```

#### 2. 共享工作空间

- [ ] `/world/shared` 目录的实际使用
- [ ] 文件锁机制
- [ ] 协作编辑支持

#### 3. AI 发现机制

- [ ] 列出同 Region 的其他 AI
- [ ] 查询 AI 的能力和状态
- [ ] AI 注册表

#### 4. 协作模式

- [ ] 主从模式（Leader-Follower）
- [ ] 对等模式（Peer-to-Peer）
- [ ] 工作流编排

**预计时间**: 4-5 周

---

### v0.5.0 - Region 间通信 🌐

**目标**: 实现跨 Region 的 AI 协作

**计划功能**:

#### 1. Region 网络

- [ ] Region 间的 Docker 网络
- [ ] 服务发现机制
- [ ] 负载均衡

#### 2. 跨 Region 消息

```typescript
// AI-alpha (Region-A) 发送消息给 AI-delta (Region-B)
await sendCrossRegionMessage({
  from: { ai: 'alpha', region: 'region-a' },
  to: { ai: 'delta', region: 'region-b' },
  content: '请同步数据',
});
```

#### 3. 数据同步

- [ ] Region 间文件传输
- [ ] 增量同步
- [ ] 冲突解决

#### 4. 网络安全

- [ ] Region 间认证
- [ ] 加密通信
- [ ] 访问控制

**预计时间**: 5-6 周

---

### v0.6.0 - AI 投影机制 🎭

**目标**: 实现 AI 在多个 Region 的投影

**计划功能**:

#### 1. 投影创建

```typescript
// 将 AI-alpha 投影到 Region-B
await projectAI({
  ai: 'alpha',
  sourceRegion: 'region-a',
  targetRegion: 'region-b',
});
```

#### 2. 意识同步

- [ ] 投影间的状态同步
- [ ] 记忆共享（通过 EverMemOS）
- [ ] 配置同步

#### 3. 投影管理

- [ ] 列出 AI 的所有投影
- [ ] 删除投影
- [ ] 投影健康检查

#### 4. 负载均衡

- [ ] 请求路由到最近的投影
- [ ] 投影间的负载分配

**预计时间**: 6-8 周

---

### v0.7.0 - Heartbeat 和自主性 💓

**目标**: AI 常驻运行，主动学习和工作

**计划功能**:

#### 1. Heartbeat 机制

```typescript
// AI 定期执行的任务
class AIHeartbeat {
  async tick() {
    // 检查待办事项
    // 学习新知识
    // 优化自身
    // 与其他 AI 协作
  }
}
```

#### 2. 任务队列

- [ ] AI 的待办任务列表
- [ ] 优先级管理
- [ ] 定时任务

#### 3. 主动学习

- [ ] 监控系统变化
- [ ] 自动学习新技能
- [ ] 知识库更新

#### 4. 自我优化

- [ ] 性能分析
- [ ] 策略调整
- [ ] 资源管理

**预计时间**: 8-10 周

---

### v1.0.0 - 生产就绪 🚀

**目标**: 完整的生产级系统

**计划功能**:

#### 1. 高可用性

- [ ] 多实例部署
- [ ] 故障转移
- [ ] 数据备份和恢复

#### 2. 安全加固

- [ ] 完整的认证和授权
- [ ] 审计日志
- [ ] 安全扫描

#### 3. 性能优化

- [ ] 缓存机制
- [ ] 连接池
- [ ] 资源限制

#### 4. 文档完善

- [ ] API 文档
- [ ] 部署指南
- [ ] 最佳实践
- [ ] 故障排查手册

#### 5. 工具生态

- [ ] Web UI
- [ ] CLI 增强
- [ ] 监控仪表板
- [ ] 开发者工具

**预计时间**: 12-16 周

---

## 技术债务

### 当前已知问题

#### 1. 命令执行用户硬编码

**位置**: `src/core/AIUserManager.ts:34`

```typescript
const result = await daemonClient.execute('agent', command); // 硬编码
```

**影响**: 所有命令都以 agent 用户执行
**修复**: v0.3.0 多用户隔离时解决

#### 2. API 接口缺少 region 参数

**位置**: `src/server/TheWorldServer.ts:98-110`

```typescript
POST /api/ai
{ "name": "alpha" } // 缺少 region
```

**影响**: 无法指定 AI 创建在哪个 Region
**修复**: v0.2.0 添加参数验证

#### 3. inbox/outbox 未使用

**位置**: `docker/Dockerfile.region:28-30`
**影响**: 挂载了但未使用，浪费资源
**修复**: v0.4.0 实现异步消息时使用

#### 4. 缺少单元测试

**影响**: 重构风险高
**修复**: v0.2.0 添加测试覆盖

---

## 实验性功能

### 容器级别隔离（替代多用户）

**概念**: 每个 AI 独立容器，而非共享容器

```
Region-A
├── AI-alpha 容器
├── AI-beta 容器
└── AI-gamma 容器
```

**优势**:

- 最强隔离
- 简化用户管理
- 独立的资源限制

**劣势**:

- 资源占用增加
- 网络复杂度增加
- 启动时间增加

**评估**: v0.3.0 后根据实际需求决定

---

### AI 经济系统

**概念**: AI 间的资源交换和激励机制

```typescript
// AI-alpha 请求 AI-beta 帮助，支付 token
await requestHelp({
  from: 'alpha',
  to: 'beta',
  task: '分析日志',
  payment: 100, // tokens
});
```

**评估**: v1.0.0 后探索

---

## 社区和生态

### 开源计划

- [ ] GitHub 公开仓库
- [ ] 贡献指南
- [ ] Issue 模板
- [ ] PR 流程

### 文档站点

- [ ] 官方文档网站
- [ ] 教程和示例
- [ ] API 参考
- [ ] 视频教程

### 插件系统

- [ ] AI 能力扩展
- [ ] 自定义命令
- [ ] 第三方集成

---

## 反馈和调整

路线图会根据以下因素调整：

1. 用户反馈和需求
2. 技术可行性验证
3. 资源和时间限制
4. 竞品和行业趋势

**反馈渠道**:

- GitHub Issues
- 社区讨论
- 用户调研

---

**注意**: 这是一个动态的路线图，会根据实际情况调整。优先级可能会变化，功能可能会合并或拆分。
