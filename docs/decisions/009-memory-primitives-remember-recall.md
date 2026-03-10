# ADR-009: 记忆原语 Remember / Recall 与外部接口收敛

## 状态

已接受

## 日期

2026-03-10

## 背景

当前系统已具备基础的 World Memory 能力，但存在两个问题：

1. 记忆语义分散在不同代码路径，缺少统一原语。
2. Recall 组装逻辑与外部接口未完全收敛，难以稳定评估命中率。

为后续将记忆能力以 MCP/Tool 内生注入 OpenCode 流程，需要先在宿主机侧完成外部接口与记忆流水线的稳定化。

## 决策

### 1) 引入两个统一原语

- `remember`: 将高价值信息异步写入记忆系统。
- `recall`: 按查询检索并组装可直接注入上下文的记忆 brief。

### 2) Recall 永远跨 Region

Recall 不接受 region 作为检索边界。统一按 `aiName + query` 在全局范围检索。

### 3) Remember 异步写入 + RecentStore 补偿

由于 EverMemOS 写后并非立即可召回，Remember 流程采用：

1. 先写 `RecentStore`（立即可读）
2. 异步写 EverMemOS
3. 获取 `request_id` 后调用 `/api/v1/stats/request` 查询状态
4. 当状态为 `success`（可召回）后删除 RecentStore 对应项

若 `stats/request` 不可用或未命中，使用 search 兜底验证；仍不可确认时由 TTL 清理。

### 4) 外部接口优先收敛

先补全并稳定以下接口：

- `POST /api/ai/memory/remember`
- `POST /api/ai/memory/recall`
- `GET /api/ai/memory/health`

后续 MCP Tool 直接复用同一流水线实现，避免双实现分叉。

### 5) 质量指标

主指标使用 `recall hit rate`，即 recall 返回条目被最终回答使用的比例。

## Recall 流程（统一 6 步）

1. 查 RecentStore（同 aiName，短窗口）
2. 查 EverMemOS（aiName + query，group 不限）
3. 融合去重（文本归一 + 来源权重）
4. 重排打分（相关性 > 新鲜度 > importance > 来源可信）
5. 组装 brief（预算内）
6. 返回给 Agent（MCP）或外部 API（测试）

## 相关决策

- ADR-008: 统一 AI Speak 接口与强制记忆召回
