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

## 岛屿临时管制

服务支持按时间段对目标岛屿暂停投递：

- `POST /api/restrictions`：登记管制窗口（岛屿、起止日时、优先级 1–10、事由）。重叠窗口允许登记，响应会返回重叠记录及裁决结果。
- `GET /api/restrictions?status=active|scheduled|expired|revoked&islandId=`：按状态/岛屿查询。
- `POST /api/restrictions/:ruleId/revoke`：撤销生效中或待生效的规则（可附撤销说明）。
- `GET /api/restrictions/audit`：不可删除的登记/撤销事件台账，过期与已撤销记录仍可追溯。

窗口采用半开区间 `[起始, 结束)`，抵达结束时刻视为管制已解除；重叠时段由优先级最高的规则主导，同优先级时后登记的规则优先。命中管制的调度方案无法结算。
