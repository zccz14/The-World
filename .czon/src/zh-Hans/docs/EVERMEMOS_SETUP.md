# EverMemOS 配置指南

## 前置条件

TheWorld 需要 EverMemOS 已部署并运行。以下是部署和配置步骤：

## 1. EverMemOS 部署

### 方式 A：使用本地 Docker（推荐）

```bash
# 克隆 EverMemOS 仓库
git clone https://github.com/EverMind-AI/EverMemOS.git
cd EverMemOS

# 启动 EverMemOS 容器栈
docker compose up -d

# 等待服务启动（约 30-60 秒）
# 检查健康状态
curl http://localhost:1995/health
# 应返回: {"status": "healthy", ...}
```

### 方式 B：使用已部署的 EverMemOS

如果 EverMemOS 已部署在其他地址，只需配置 URL：

```bash
# 在 .env 文件中设置
EVERMEMOS_URL=http://your-evermemos-server:1995
```

## 2. 配置 TheWorld

复制配置文件模板：

```bash
cd The-World
cp .env.example .env
```

编辑 `.env` 文件，填入必要的配置：

### 必需配置

```bash
# EverMemOS 地址
EVERMEMOS_URL=http://localhost:1995

# AI API Key（OpenAI 或 Anthropic）
REAL_AI_API_KEY=sk-your-api-key
AI_TARGET_BASE_URL=https://api.openai.com/v1

# EverMemOS 使用的 API Keys
LLM_API_KEY=sk-your-api-key
VECTORIZE_API_KEY=your-vectorize-key
```

## 3. API Key 配置说明

### OpenAI API

```bash
REAL_AI_API_KEY=sk-proj-xxxxxxxxxxxxx
AI_TARGET_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-proj-xxxxxxxxxxxxx
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx  # 从 Vectorize.io 获取
```

### Anthropic API

```bash
REAL_AI_API_KEY=sk-ant-xxxxxxxxxxxxx
AI_TARGET_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-xxxxxxxxxxxxx
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx
```

### Azure OpenAI

```bash
REAL_AI_API_KEY=your-azure-key
AI_TARGET_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
LLM_API_KEY=your-azure-key
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx
```

## 4. Vectorize API Key

EverMemOS 需要 Vectorize API Key 进行向量化：

1. 访问 https://vectorize.io
2. 注册账号
3. 在 Dashboard 中获取 API Key
4. 配置到 `.env` 文件：

```bash
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx
```

## 5. 验证配置

启动 TheWorld 并验证：

```bash
# 启动 TheWorld
dio start

# 检查状态
dio status

# 应看到：
# ✅ TheWorld 服务器运行中
#    Server: http://localhost:3344
#    AI Proxy: http://localhost:3344/v1
#    EverMemOS 状态: ✅ 健康
```

## 6. 常见问题

### EverMemOS 连接失败

```bash
# 检查 EverMemOS 是否运行
curl http://localhost:1995/health

# 检查 Docker 容器
docker ps | grep evermemos

# 查看 EverMemOS 日志
docker logs evermemos-api
```

### API Key 无效

```bash
# 测试 OpenAI API Key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-your-key"

# 测试 Anthropic API Key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk-ant-your-key"
```

### Vectorize API Key 问题

```bash
# 检查 Vectorize API Key
curl -X POST https://api.vectorize.io/v1/embeddings \
  -H "Authorization: Bearer vz-your-key" \
  -H "Content-Type: application/json" \
  -d '{"input": "test"}'
```

## 7. 配置优先级

TheWorld 配置加载顺序：

1. 环境变量（最高优先级）
2. `.env` 文件
3. 默认值（最低优先级）

例如：

```bash
# 方式 1: 使用 .env 文件
EVERMEMOS_URL=http://localhost:1995

# 方式 2: 使用环境变量（会覆盖 .env）
export EVERMEMOS_URL=http://production-server:1995
dio start
```

## 8. 生产环境配置

```bash
# .env.production
EVERMEMOS_URL=http://production-evermemos:1995

# 使用生产级 API Key
REAL_AI_API_KEY=sk-proj-production-key
AI_TARGET_BASE_URL=https://api.openai.com/v1

# EverMemOS 生产配置
LLM_API_KEY=sk-proj-production-key
VECTORIZE_API_KEY=vz-production-key

# 日志级别
LOG_LEVEL=info

# 数据存储路径
WORLD_DATA_DIR=/var/lib/the-world
```

## 9. 安全建议

- ✅ 将 `.env` 文件添加到 `.gitignore`
- ✅ 不要在代码中硬编码 API Keys
- ✅ 使用环境变量管理敏感信息
- ✅ 定期轮换 API Keys
- ✅ 限制 API Key 的权限和额度

## 10. 下一步

配置完成后：

```bash
# 启动 TheWorld
dio start

# 创建 Region
dio region create -n region-a

# 创建 AI
dio ai create -n alpha

# 开始使用！
dio ai speak -t alpha -r region-a -m "hello world"
```

## 11. 分层记忆说明

- EverMemOS 存储可召回的压缩记忆（工作层/知识层/情节层）
- 完整审计记录写入宿主机：`~/.the-world/audit/world-memory-audit.jsonl`
- 审计层默认长期累积，用于追溯，不直接拼接到 AI 上下文

## 参考链接

- EverMemOS 文档：https://github.com/EverMind-AI/EverMemOS
- OpenAI API：https://platform.openai.com
- Anthropic API：https://console.anthropic.com
- Vectorize：https://vectorize.io
