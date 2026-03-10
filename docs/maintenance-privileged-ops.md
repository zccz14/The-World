# 特权维护实现说明（单人审批）

## 目标

在 Region 默认非特权运行前提下，提供一条最小化的特权维护通道：

- 容器/系统只能申请 ticket，不能直接拿 root shell
- 人类（单用户）审批后，宿主机以 `docker exec -u root` 执行白名单动作
- 全流程保留状态和执行结果

## 设计边界

- 单审批者模型（不引入多角色/多人审批）
- 只支持白名单动作：`apt_update`、`install_packages`
- 不支持任意命令透传（禁止 `bash -c <user_input>`）

## 数据模型

维护 ticket 存储在：`~/.the-world/maintenance/tickets.json`

核心字段：

- `id`
- `region`
- `action`
- `params`
- `reason`
- `status` (`requested` | `approved` | `rejected` | `done` | `failed`)
- `expiresAt`
- `result`（执行后填充）

## API

- `POST /api/maintenance/tickets` 创建 ticket
- `GET /api/maintenance/tickets` 列表（可按 `status` 过滤）
- `GET /api/maintenance/tickets/:id` 查询 ticket
- `POST /api/maintenance/tickets/:id/approve` 批准
- `POST /api/maintenance/tickets/:id/reject` 拒绝
- `POST /api/maintenance/tickets/:id/run` 执行

## CLI

- `dio maintenance:request -r <region> -a apt_update -m "..."`
- `dio maintenance:request -r <region> -a install_packages -p "jq,curl" -m "..."`
- `dio maintenance:approve -i <ticket-id>`
- `dio maintenance:reject -i <ticket-id> -m "..."`
- `dio maintenance:run -i <ticket-id>`
- `dio maintenance:status -i <ticket-id>`
- `dio maintenance:status -s requested`

## 执行器

- 宿主机执行入口：`DockerManager.execInContainer(..., user='root')`
- 容器内固定脚本：`/usr/local/bin/tw-maint`
- `tw-maint` 只接受白名单动作并做参数校验

## 测试

### 自动化测试

`npm test -- MaintenanceManager.test.ts`

覆盖点：

- `install_packages` 参数校验
- 状态流转（request -> approve -> run -> done）
- 未批准不得执行
- 过期 ticket 拒绝执行

### 手工联调

1. 创建 Region：`dio region create -n region-a`
2. 提交 ticket：`dio maintenance:request -r region-a -a apt_update -m "refresh apt index"`
3. 批准 ticket：`dio maintenance:approve -i <id>`
4. 执行 ticket：`dio maintenance:run -i <id>`
5. 查询结果：`dio maintenance:status -i <id>`
