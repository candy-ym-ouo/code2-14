# 浮空岛邮政调度员

React 调度面板 + Node.js 权威游戏服务。完整的玩法、规则、接口、运行和验收说明见 [项目文档.md](./项目文档.md)。

```bash
npm install
npm run dev
```

开发模式访问 `http://localhost:5173`，生产模式执行：

```bash
npm run build
npm start
```

然后访问 `http://localhost:3001`。

## 岛屿临时管制登记

岛屿可登记临时航管令，按「日期区间 + 时刻窗口」限制目标投递，调度面板与结算共用同一权威判定。

- **时间段限制**：方案试算的预计抵达时刻落入目标岛屿的有效管制窗口时，产生 `TARGET_RESTRICTED` 校验问题，当日结算被阻止；窗口支持同日与跨日，时刻按闭区间处理。
- **可撤销**：生效中 / 待生效的记录可以撤销，撤销只追加标记，记录永不删除；已过期的记录不能撤销，只能追溯。
- **重叠优先级**：优先级 1-10（数值大的优先），同优先级时先登记者优先，判定完全确定；面板会标注每条记录的重叠窗口与「主导」标记。
- **审计追溯**：登记与撤销都会追加不可变审计事件，`GET /api/restrictions` 始终返回全部记录（生效中、待生效、已过期、已撤销）和完整事件流。

接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/restrictions` | 管制台账（含派生状态、重叠信息）与审计事件流 |
| POST | `/api/restrictions` | 登记管制：`islandId / startDay / startHour / endDay / endHour / priority(1-10, 默认5) / reason / registeredBy?` |
| POST | `/api/restrictions/:id/revoke` | 撤销管制：`revokeReason? / revokedBy?`，已撤销或已过期返回 400 |

登记 / 撤销都会递增存档 `revision`，使旧的调度提交因版本冲突失效。管制数据随游戏存档持久化，旧存档缺少该字段时会在加载时自动补齐；`重新开局`会清空台账并开始新的登记序列。

```bash
npm test   # 运行全部测试（含管制引擎、HTTP 闭环与旧存档迁移）
```

