# ADR-002: 统一端口架构

## 状态

已采纳

## 日期

2026-03-08

## 背景

`SERVER_REDESIGN.md` 提议的架构：

```
宿主机
├── TheWorld Daemon (HTTP Server)
│   └── 端口: 1996 (TheWorld API Server)
│
└── AI Proxy Server
    └── 端口: 3456 (AI API 代理)
```

这种分离架构的优势：

- 关注点分离（API Server vs Proxy）
- 可以独立扩展
- 符合微服务理念

但也带来了复杂度：

- 需要管理两个端口
- 需要两个独立的进程
- 配置文件更复杂
- 部署和监控成本增加

## 决策

使用单一端口 3344，通过路径区分不同职责：

```
TheWorldServer (端口 3344)
├── /health                    # 健康检查
├── /api/status                # 状态查询
├── /api/regions               # Region 管理
├── /api/ai                    # AI 管理
├── /api/ai/exec               # 命令执行
├── /api/oracle/send           # 神谕
├── /api/agent/:region/:user/* # Agent 管理
├── /opencode/:region/*        # OpenCode 代理
└── /v1/*                      # AI API 代理
```

**实现方式**：

```typescript
export class TheWorldServer {
  private app: Express;
  private proxyHandler: AIProxyHandler;

  constructor() {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes() {
    // API 路由
    this.app.get('/health', ...);
    this.app.post('/api/regions', ...);
    // ...

    // AI Proxy（集成在同一服务）
    this.app.use('/v1', this.proxyHandler.getMiddleware());
  }

  start(port: number = 3344) {
    this.app.listen(port);
  }
}
```

## 理由

### 1. 简化部署

- 只需管理一个端口
- 只需启动一个进程
- 防火墙配置简单

### 2. 简化配置

```bash
# 之前（两个端口）
THEWORLD_PORT=1996
AI_PROXY_PORT=3456

# 现在（一个端口）
SERVER_PORT=3344
```

### 3. 统一的监控和日志

- 单一的健康检查端点
- 统一的日志输出
- 简化的错误追踪

### 4. 更好的开发体验

- 本地开发只需启动一个服务
- 调试更简单
- 测试更容易

### 5. 路径区分已足够清晰

- `/api/*` - TheWorld 管理 API
- `/v1/*` - AI API 代理
- 职责边界清晰，无需物理分离

## 后果

### 正面影响

✅ 部署复杂度降低 50%  
✅ 配置文件简化  
✅ 端口管理简化  
✅ 监控和日志统一  
✅ 开发和调试效率提升

### 负面影响

⚠️ 单点故障（一个服务挂掉，所有功能不可用）  
⚠️ 无法独立扩展 API Server 和 Proxy  
⚠️ 资源竞争（API 和 Proxy 共享进程资源）

### 风险缓解

- Node.js 异步 I/O 性能足够
- MVP 阶段流量不大，单进程足够
- 未来可以通过负载均衡扩展
- 可以通过 PM2 cluster 模式提升可用性

## 性能考虑

### 单进程性能测试

- 并发 50 个请求: < 1 秒
- API 延迟: ~10-50ms
- Proxy 延迟: ~100-200ms（取决于上游）
- 内存占用: ~50MB

### 扩展性

如果未来需要扩展，可以：

1. 使用 PM2 cluster 模式（多进程）
2. 使用 Nginx 负载均衡（多实例）
3. 拆分为微服务（如果真的需要）

## 未来考虑

如果遇到以下情况，可以考虑拆分：

### 场景 1: 性能瓶颈

- API Server 和 Proxy 互相影响
- 单进程无法满足并发需求
- 需要独立扩展

**解决方案**: 拆分为两个服务，使用负载均衡

### 场景 2: 安全隔离

- 需要更强的安全边界
- Proxy 需要独立的安全策略

**解决方案**: 独立部署 Proxy，使用独立的网络策略

### 场景 3: 团队分工

- 不同团队负责 API 和 Proxy
- 需要独立的发布周期

**解决方案**: 拆分为独立的代码仓库和服务

## 相关决策

- ADR-001: 单用户架构
- ADR-003: 同步命令执行

## 参考

- `src/server/TheWorldServer.ts` - 统一服务实现
- `src/utils/config.ts:34-37` - 端口配置
- `.env.example:41-43` - 配置示例
