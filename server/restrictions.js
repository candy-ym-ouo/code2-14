import { GameRuleError, HUB_ID, getIsland } from './engine.js';

export const MIN_PRIORITY = 1;
export const MAX_PRIORITY = 10;
export const DEFAULT_PRIORITY = 5;
export const PRIORITY_RULE = '优先级数值越大越先生效；优先级相同时，先登记者优先。';

const MAX_REASON_LENGTH = 120;
const MAX_OPERATOR_LENGTH = 40;

/**
 * 管制窗口按“游戏内时刻”比较：第 day 日的 hour 点统一换算为小时数。
 * hour 允许 0-24 的整数，24 表示当日最后一刻，因此跨日窗口可以直接表达。
 */
export function windowStart(record) {
  return record.startDay * 24 + record.startHour;
}

export function windowEnd(record) {
  return record.endDay * 24 + record.endHour;
}

function asBoundedInteger(value, fieldName, minimum, maximum) {
  if (!Number.isInteger(value)) {
    throw new GameRuleError(`${fieldName}必须是整数。`);
  }
  if (value < minimum || value > maximum) {
    throw new GameRuleError(`${fieldName}必须在 ${minimum} 到 ${maximum} 之间。`);
  }
  return value;
}

function asOperator(value) {
  if (value === undefined || value === null) return '值班调度员';
  if (typeof value !== 'string') {
    throw new GameRuleError('登记者必须是字符串。');
  }
  const operator = value.trim();
  if (operator.length === 0 || operator.length > MAX_OPERATOR_LENGTH) {
    throw new GameRuleError(`登记者长度必须在 1 到 ${MAX_OPERATOR_LENGTH} 个字符之间。`);
  }
  return operator;
}

function asReason(value, { optional = false, fallback = '' } = {}) {
  if (value === undefined || value === null) {
    if (optional) return fallback;
    throw new GameRuleError('必须提供管制事由。');
  }
  if (typeof value !== 'string') {
    throw new GameRuleError('管制事由必须是字符串。');
  }
  const reason = value.trim();
  if (reason.length < 2 && !optional) {
    throw new GameRuleError('管制事由至少需要 2 个字符。');
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new GameRuleError(`管制事由不能超过 ${MAX_REASON_LENGTH} 个字符。`);
  }
  return reason || fallback;
}

function assertTargetIsland(state, islandId) {
  if (typeof islandId !== 'string' || islandId.length === 0) {
    throw new GameRuleError('必须指定管制岛屿。');
  }
  const island = getIsland(state, islandId);
  if (!island || island.id === HUB_ID) {
    throw new GameRuleError(`管制岛屿 ${islandId || '(空)'} 无效，中央邮港不可被管制。`);
  }
}

/**
 * 登记一条临时管制规则。
 * 输入：{ islandId, startDay, startHour, endDay, endHour, priority?, reason, registeredBy? }
 * 规则一经写入不可修改，只能通过撤销终止，窗口信息同时进入审计日志。
 */
export function registerRestriction(state, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GameRuleError('登记请求必须是 JSON 对象。');
  }

  assertTargetIsland(state, input.islandId);
  const startDay = asBoundedInteger(input.startDay, '开始日期', state.day, state.days);
  const endDay = asBoundedInteger(input.endDay, '结束日期', state.day, state.days);
  const startHour = asBoundedInteger(input.startHour, '开始时刻', 0, 24);
  const endHour = asBoundedInteger(input.endHour, '结束时刻', 0, 24);

  if (endDay < startDay) {
    throw new GameRuleError('结束日期不能早于开始日期。');
  }
  if (endDay === startDay && endHour <= startHour) {
    throw new GameRuleError('同日窗口的结束时刻必须晚于开始时刻。');
  }

  const priority = input.priority === undefined || input.priority === null
    ? DEFAULT_PRIORITY
    : asBoundedInteger(input.priority, '优先级', MIN_PRIORITY, MAX_PRIORITY);
  const reason = asReason(input.reason);
  const registeredBy = asOperator(input.registeredBy);

  state.restrictionSeq = Number.isInteger(state.restrictionSeq) ? state.restrictionSeq + 1 : 1;
  const sequence = state.restrictionSeq;
  const now = new Date().toISOString();
  const record = {
    id: `R-${String(sequence).padStart(4, '0')}`,
    sequence,
    islandId: input.islandId,
    startDay,
    startHour,
    endDay,
    endHour,
    priority,
    reason,
    registeredBy,
    registeredAt: now,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null
  };
  state.restrictions.push(record);
  state.restrictionAudit.push({
    id: `A-${String(sequence).padStart(4, '0')}-R`,
    type: 'register',
    restrictionId: record.id,
    islandId: record.islandId,
    startDay,
    startHour,
    endDay,
    endHour,
    priority,
    reason,
    by: registeredBy,
    at: now
  });
  return record;
}

/**
 * 撤销规则：记录永不删除，只写入撤销字段与审计事件。
 * 已过期或已撤销的规则不能再次撤销——它们属于必须原样保留的历史。
 */
export function revokeRestriction(state, restrictionId, input = {}) {
  if (typeof restrictionId !== 'string' || restrictionId.length === 0) {
    throw new GameRuleError('必须提供要撤销的管制编号。');
  }
  const record = state.restrictions.find((item) => item.id === restrictionId);
  if (!record) {
    throw new GameRuleError(`找不到管制记录 ${restrictionId}。`, [], 404);
  }
  if (record.revokedAt) {
    throw new GameRuleError(`${restrictionId} 已经撤销，不能重复撤销。`);
  }
  if (getRestrictionStatus(record, state.day) === 'expired') {
    throw new GameRuleError(`${restrictionId} 已过期，过期记录只能审计追溯，不能撤销。`);
  }

  const revokedBy = asOperator(input?.revokedBy);
  const revokeReason = asReason(input?.revokeReason, { optional: true, fallback: '调度撤销' });
  const now = new Date().toISOString();
  record.revokedAt = now;
  record.revokedBy = revokedBy;
  record.revokeReason = revokeReason;
  state.restrictionAudit.push({
    id: `A-${String(state.restrictionAudit.length + 1).padStart(4, '0')}-V`,
    type: 'revoke',
    restrictionId: record.id,
    islandId: record.islandId,
    startDay: record.startDay,
    startHour: record.startHour,
    endDay: record.endDay,
    endHour: record.endHour,
    priority: record.priority,
    reason: revokeReason,
    by: revokedBy,
    at: now
  });
  return record;
}

/** 日期粒度的状态，用于面板分组；时刻粒度的拦截请使用 findEffectiveRestrictions。 */
export function getRestrictionStatus(record, currentDay) {
  if (record.revokedAt) return 'revoked';
  if (record.endDay < currentDay) return 'expired';
  if (record.startDay > currentDay) return 'upcoming';
  return 'active';
}

export function windowsOverlap(first, second) {
  if (first.islandId !== second.islandId) return false;
  if (first.revokedAt || second.revokedAt) return false;
  return windowStart(first) <= windowEnd(second) && windowStart(second) <= windowEnd(first);
}

/**
 * 重叠窗口的确定性优先级：priority 数值大者优先；同 priority 时登记序号小（先登记）者优先。
 */
export function compareRestrictionPriority(first, second) {
  if (first.priority !== second.priority) return second.priority - first.priority;
  return first.sequence - second.sequence;
}

/**
 * 返回在某岛屿、某游戏时刻仍然有效的管制（未撤销且窗口覆盖该时刻），按优先级排序。
 */
export function findEffectiveRestrictions(state, day, hour, islandId) {
  const moment = day * 24 + hour;
  return state.restrictions
    .filter((record) => (
      record.islandId === islandId &&
      !record.revokedAt &&
      moment >= windowStart(record) &&
      moment <= windowEnd(record)
    ))
    .sort(compareRestrictionPriority);
}

function describeWindow(record) {
  const pad = (value) => String(value).padStart(2, '0');
  const sameDay = record.startDay === record.endDay;
  return sameDay
    ? `第${record.startDay}日 ${pad(record.startHour)}:00-${pad(record.endHour)}:00`
    : `第${record.startDay}日${pad(record.startHour)}:00 至 第${record.endDay}日${pad(record.endHour)}:00`;
}

/**
 * 汇总登记台账：为每条记录补充派生状态、岛屿名称、重叠窗口与主导标记，
 * 并输出带岛屿名称的审计事件流（过期与已撤销记录同样保留）。
 */
export function buildRestrictionView(state) {
  const currentDay = state.day;
  const records = state.restrictions.map((record) => {
    const island = getIsland(state, record.islandId);
    const status = getRestrictionStatus(record, currentDay);
    const overlaps = state.restrictions
      .filter((other) => other.id !== record.id && windowsOverlap(record, other))
      .map((other) => ({ id: other.id, priority: other.priority, sequence: other.sequence }))
      .sort((first, second) => (
        second.priority - first.priority || first.sequence - second.sequence
      ));
    const rivals = state.restrictions
      .filter((other) => other.id !== record.id && windowsOverlap(record, other) && !other.revokedAt);
    const dominant = record.revokedAt
      ? false
      : rivals.every((other) => compareRestrictionPriority(record, other) < 0);

    return {
      ...record,
      islandName: island?.name || record.islandId,
      status,
      window: describeWindow(record),
      overlaps,
      dominant
    };
  });

  const audit = state.restrictionAudit.map((event) => ({
    ...event,
    islandName: getIsland(state, event.islandId)?.name || event.islandId
  }));

  return {
    priorityRule: PRIORITY_RULE,
    currentDay,
    activeCount: records.filter((record) => record.status === 'active' && !record.revokedAt).length,
    records,
    audit
  };
}

/**
 * 在方案试算航线之后执行管制检查：
 * 任何航段的预计抵达时刻落入目标岛屿的有效管制窗口，方案即不合法。
 * 同时在航段结果上标注命中的管制规则，供面板展示。
 */
export function collectRestrictionIssues(state, routes) {
  const issues = [];
  for (const route of routes) {
    for (const leg of route.letters) {
      const effective = findEffectiveRestrictions(state, state.day, leg.arrivalHour, leg.targetIslandId);
      if (effective.length === 0) continue;
      const winner = effective[0];
      leg.restrictedBy = winner.id;
      leg.restrictionReason = winner.reason;
      const island = getIsland(state, leg.targetIslandId);
      const totalMinutes = Math.round(leg.arrivalHour * 60);
      const clock = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
      issues.push({
        code: 'TARGET_RESTRICTED',
        letterId: leg.letterId,
        courierId: route.courierId,
        restrictionId: winner.id,
        priority: winner.priority,
        rivals: effective.slice(1).map((item) => item.id),
        message: `${leg.letterId} 预计 ${clock} 抵达${island?.name || leg.targetIslandId}，正处于管制窗口（${winner.id}，优先级 ${winner.priority}：${winner.reason}），该时刻禁止投递。`
      });
    }
  }
  return issues;
}
