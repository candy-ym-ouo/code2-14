import { GameRuleError, HUB_ID } from './engine.js';

export const PLAN_START_HOUR = 7;
export const MIN_PRIORITY = 1;
export const MAX_PRIORITY = 10;
export const DEFAULT_PRIORITY = 5;
export const DAY_HOURS = 24;
export const REASON_MAX_LENGTH = 40;
export const NOTE_MAX_LENGTH = 120;

export const CONTROL_STATUSES = ['active', 'scheduled', 'expired', 'revoked'];
export const CONTROL_STATUS_LABELS = {
  active: '生效中',
  scheduled: '待生效',
  expired: '已过期',
  revoked: '已撤销'
};

function toAbsoluteHours(day, hour) {
  return (day - 1) * DAY_HOURS + hour;
}

export function windowRange(rule) {
  return {
    start: toAbsoluteHours(rule.startDay, rule.startHour),
    end: toAbsoluteHours(rule.endDay, rule.endHour)
  };
}

function daySpan(day) {
  return {
    start: toAbsoluteHours(day, PLAN_START_HOUR),
    end: toAbsoluteHours(day + 1, PLAN_START_HOUR)
  };
}

function rangesOverlap(first, second) {
  return first.start < second.end && second.start < first.end;
}

export function getRestrictionStatus(rule, day) {
  if (rule.revokedAt) return 'revoked';
  const range = windowRange(rule);
  const span = daySpan(day);
  if (range.end <= span.start) return 'expired';
  if (range.start >= span.end) return 'scheduled';
  return 'active';
}

export function isRestrictionLive(rule, day) {
  const status = getRestrictionStatus(rule, day);
  return status === 'active' || status === 'scheduled';
}

/**
 * 在某个绝对时刻（自第 1 日 0 点起的小时数）对某岛屿生效的管制规则。
 * 重叠窗口按优先级取最高者；同优先级时后登记的规则优先。
 */
export function findGoverningRule(rules, islandId, absoluteHour) {
  const candidates = rules
    .filter((rule) => (
      !rule.revokedAt &&
      rule.islandId === islandId &&
      absoluteHour >= windowRange(rule).start &&
      absoluteHour < windowRange(rule).end
    ))
    .sort((first, second) => (
      second.priority - first.priority ||
      first.sequence - second.sequence
    ));
  return candidates[0] || null;
}

/**
 * 找出与待登记窗口重叠、且仍在生命周期内的同岛规则，
 * 并标注在重叠时段内由哪条规则主导。
 */
export function findOverlappingRules(state, islandId, range) {
  const incomingPriority = range.priority ?? DEFAULT_PRIORITY;
  return state.restrictions
    .filter((rule) => (
      rule.islandId === islandId &&
      isRestrictionLive(rule, state.day) &&
      rangesOverlap(windowRange(rule), range)
    ))
    .sort((first, second) => first.sequence - second.sequence)
    .map((rule) => {
      const newerWins = incomingPriority >= rule.priority;
      return {
        ruleId: rule.id,
        priority: rule.priority,
        startDay: rule.startDay,
        startHour: rule.startHour,
        endDay: rule.endDay,
        endHour: rule.endHour,
        reason: rule.reason,
        // 新规则优先级更高，或同优先级（后登记优先）时，新规则在重叠时段主导。
        precedence: newerWins ? 'newer' : 'older'
      };
    });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readInteger(value, fieldName, { min, max }) {
  if (!Number.isInteger(value)) {
    throw new GameRuleError(`${fieldName}必须是整数。`);
  }
  if (value < min || value > max) {
    throw new GameRuleError(`${fieldName}必须在 ${min} 到 ${max} 之间。`);
  }
  return value;
}

function readText(value, fieldName, { min = 1, max, required = true }) {
  if (value === undefined || value === null) {
    if (required) throw new GameRuleError(`必须填写${fieldName}。`);
    return '';
  }
  if (typeof value !== 'string') {
    throw new GameRuleError(`${fieldName}必须是文本。`);
  }
  const text = value.trim();
  if (text.length < min) throw new GameRuleError(`${fieldName}至少需要 ${min} 个字符。`);
  if (text.length > max) throw new GameRuleError(`${fieldName}不能超过 ${max} 个字符。`);
  return text;
}

/**
 * 解析并校验登记请求，返回可直接落库的窗口数据。
 */
export function parseRegistrationInput(state, body) {
  if (!isPlainObject(body)) {
    throw new GameRuleError('请求体必须是 JSON 对象。');
  }

  const islandId = readText(body.islandId, '管制岛屿', { max: 40 });
  const island = state.islands.find((item) => item.id === islandId);
  if (!island) {
    throw new GameRuleError(`找不到岛屿 ${islandId}。`);
  }
  if (islandId === HUB_ID) {
    throw new GameRuleError('天枢邮港是出发港，不能登记投递管制。');
  }

  const startDay = readInteger(body.startDay, '起始日', { min: 1, max: state.days });
  const startHour = readInteger(body.startHour, '起始时刻', { min: 0, max: 23 });
  const endDay = readInteger(body.endDay, '结束日', { min: 1, max: state.days });
  const endHour = readInteger(body.endHour, '结束时刻', { min: 0, max: 23 });

  const start = toAbsoluteHours(startDay, startHour);
  const end = toAbsoluteHours(endDay, endHour);
  if (end <= start) {
    throw new GameRuleError('结束时间必须晚于起始时间。');
  }

  const todayStart = toAbsoluteHours(state.day, 0);
  if (start < todayStart) {
    throw new GameRuleError('不能为已经过去的日期登记管制，请把起始时间设在今日 0 点之后。');
  }

  let priority = DEFAULT_PRIORITY;
  if (body.priority !== undefined && body.priority !== null) {
    priority = readInteger(body.priority, '优先级', { min: MIN_PRIORITY, max: MAX_PRIORITY });
  }

  const reason = readText(body.reason, '管制事由', { max: REASON_MAX_LENGTH });
  const note = readText(body.note, '备注', { min: 0, max: NOTE_MAX_LENGTH, required: false });

  return { islandId, startDay, startHour, endDay, endHour, priority, reason, note, start, end };
}

function nextSequence(state) {
  return state.restrictions.reduce((max, rule) => Math.max(max, rule.sequence), 0) + 1;
}

/**
 * 登记一条临时管制规则。重叠窗口不会被拒绝，但响应会明确优先级裁决。
 */
export function registerRestriction(state, body) {
  const input = parseRegistrationInput(state, body);
  const sequence = nextSequence(state);
  const now = new Date().toISOString();
  const overlaps = findOverlappingRules(state, input.islandId, input);
  const rule = {
    id: `R${String(sequence).padStart(3, '0')}`,
    sequence,
    islandId: input.islandId,
    startDay: input.startDay,
    startHour: input.startHour,
    endDay: input.endDay,
    endHour: input.endHour,
    priority: input.priority,
    reason: input.reason,
    note: input.note,
    registeredAt: now,
    revokedAt: null,
    revokedReason: null
  };

  state.restrictions.push(rule);
  state.restrictionEvents.push({
    sequence,
    type: 'register',
    at: now,
    ruleId: rule.id,
    islandId: rule.islandId,
    startDay: rule.startDay,
    startHour: rule.startHour,
    endDay: rule.endDay,
    endHour: rule.endHour,
    priority: rule.priority,
    reason: rule.reason,
    note: rule.note,
    overlapRuleIds: overlaps.map((item) => item.ruleId)
  });
  state.revision = Number.isInteger(state.revision) ? state.revision + 1 : 1;

  return { rule: publicRestriction(state, rule), overlaps };
}

export function revokeRestriction(state, ruleId, rawReason) {
  const rule = state.restrictions.find((item) => item.id === ruleId);
  if (!rule) {
    throw new GameRuleError(`找不到管制记录 ${ruleId || '(空)'}。`, [], 404);
  }
  if (rule.revokedAt) {
    throw new GameRuleError(`${rule.id} 已经撤销，不能重复操作。`, [], 409);
  }
  const status = getRestrictionStatus(rule, state.day);
  if (status === 'expired') {
    throw new GameRuleError(`${rule.id} 已过期，无需撤销；记录保留在审计台账中。`, [], 409);
  }
  const reason = readText(rawReason, '撤销说明', { min: 0, max: NOTE_MAX_LENGTH, required: false });
  const now = new Date().toISOString();
  rule.revokedAt = now;
  rule.revokedReason = reason;
  state.restrictionEvents.push({
    sequence: nextSequence(state),
    type: 'revoke',
    at: now,
    ruleId: rule.id,
    islandId: rule.islandId,
    reason
  });
  state.revision = Number.isInteger(state.revision) ? state.revision + 1 : 1;
  return publicRestriction(state, rule);
}

export function publicRestriction(state, rule) {
  const island = state.islands.find((item) => item.id === rule.islandId);
  return {
    ...rule,
    islandName: island ? island.name : rule.islandId,
    islandCode: island ? island.code : '',
    status: getRestrictionStatus(rule, state.day)
  };
}

export function describeRestrictions(state, filters = {}) {
  const rules = state.restrictions
    .map((rule) => publicRestriction(state, rule))
    .filter((rule) => {
      if (filters.islandId && rule.islandId !== filters.islandId) return false;
      if (filters.status && rule.status !== filters.status) return false;
      return true;
    })
    .sort((first, second) => second.sequence - first.sequence);
  const events = structuredClone(state.restrictionEvents)
    .filter((event) => {
      if (filters.islandId && event.islandId !== filters.islandId) return false;
      return true;
    })
    .sort((first, second) => second.sequence - first.sequence);
  return { rules, events };
}
