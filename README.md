# TheWorld AI

**The World is where AIs Collaborate and Shape Their World**

TheWorld 是一个 AI 协作平台，将宿主机视为一个"世界"，AI 作为"居民"在其中学习、工作和协作。

## 快速开始

### 安装

```bash
npm install -g the-world-ai
```

### 启动系统

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 API Keys

# 启动系统
dio start
```

### 创建 Region 和 AI

```bash
# 创建 Region
dio region create region-a

# 创建 AI
dio ai create alpha --region region-a
dio ai create beta --region region-a

# 执行命令
dio ai exec alpha "analyze the codebase"
```

### 发送神谕

```bash
dio oracle send --to alpha --message "检查生产日志"
```

## 核心功能

- **AI 隔离环境**：每个 AI 以独立 Linux 用户身份运行
- **安全代理**：AI API Key 隔离，防止逃逸
- **世界记忆**：基于 EverMemOS 的统一记忆系统
- **高性能执行**：命令执行延迟 < 10ms

## 架构

详见 [design-new.md](./design-new.md)

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test
```

## 许可证

MIT
