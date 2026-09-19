import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDay,
  createInitialState,
  GameRuleError,
  previewPlan,
  publicGameState
} from '../engine.js';
import {
  CONTROL_STATUS_LABELS,
  describeRestrictions,
  findGoverningRule,
  getRestrictionStatus,
  registerRestriction,
  revokeRestriction
} from '../restrictions.js';

function register(state, overrides = {}) {
  return registerRestriction(state, {
    islandId: 'sun',
    startDay: state.day,
    startHour: 7,
    endDay: state.day,
    endHour: 12,
    priority: 5,
    reason: '风暴警戒',
    ...overrides
  });
}

test('管制规则按登记顺序编号并附带审计事件', () => {
  const state = createInitialState({ seed: 'restriction-register' });
  const first = register(state);
  const second = register(state, { islandId: 'gale', reason: '航道检修' });

  assert.equal(first.rule.id, 'R001');
  assert.equal(second.rule.id, 'R002');
  assert.equal(second.rule.status, 'active');
  assert.equal(second.rule.islandName, '风翎岛');
  assert.equal(state.restrictionEvents.length, 2);
  assert.deepEqual(state.restrictionEvents.map((event) => event.type), ['register', 'register']);
});

test('窗口在抵达结束时刻时解除，开始时刻立即生效（半开区间）', () => {
  const state = createInitialState({ seed: 'restriction-window' });
  register(state, { startHour: 7, endHour: 10 });

  const rules = state.restrictions;
  assert.equal(findGoverningRule(rules, 'sun', 10), null);
  assert.equal(findGoverningRule(rules, 'sun', 7).id, 'R001');
  assert.equal(findGoverningRule(rules, 'sun', 9.99).id, 'R001');
  assert.equal(findGoverningRule(rules, 'gale', 8), null);
});

test('同岛重叠窗口按优先级裁决，同优先级时后登记的主导', () => {
  const state = createInitialState({ seed: 'restriction-priority' });
  register(state, { startHour: 7, endHour: 12, priority: 3, reason: '低优先级' });
  const high = register(state, { startHour: 10, endHour: 15, priority: 8, reason: '高优先级' });
  const tie = register(state, { startHour: 12, endHour: 18, priority: 8, reason: '同优先级后登记' });

  const rules = state.restrictions;
  assert.equal(findGoverningRule(rules, 'sun', 8).id, 'R001');
  assert.equal(findGoverningRule(rules, 'sun', 11).id, 'R002');
  assert.equal(findGoverningRule(rules, 'sun', 16).id, 'R003');
  assert.equal(high.overlaps.some((item) => item.ruleId === 'R001' && item.precedence === 'newer'), true);
  assert.equal(tie.overlaps.some((item) => item.ruleId === 'R002' && item.precedence === 'newer'), true);

  const lowerResponse = register(state, { startHour: 7, endHour: 12, priority: 2, reason: '更弱' });
  assert.equal(lowerResponse.overlaps.find((item) => item.ruleId === 'R001').precedence, 'older');
});

test('撤销后规则不再主导投递，事件与撤销说明进入台账', () => {
  const state = createInitialState({ seed: 'restriction-revoke' });
  const { rule } = register(state, { startHour: 7, endHour: 18 });
  revokeRestriction(state, rule.id, '天气解除');

  assert.equal(getRestrictionStatus(state.restrictions[0], state.day), 'revoked');
  assert.equal(findGoverningRule(state.restrictions, 'sun', 10), null);
  const revokeEvent = state.restrictionEvents.at(-1);
  assert.equal(revokeEvent.type, 'revoke');
  assert.equal(revokeEvent.reason, '天气解除');

  assert.throws(() => revokeRestriction(state, rule.id), (error) => error.statusCode === 409);
});

test('过期规则无法撤销但仍在审计台账中可追溯', () => {
  const state = createInitialState({ seed: 'restriction-expired' });
  const { rule } = register(state, {
    startDay: state.day,
    startHour: 7,
    endDay: state.day,
    endHour: 8
  });
  state.day += 1;

  assert.equal(getRestrictionStatus(state.restrictions[0], state.day), 'expired');
  assert.throws(() => revokeRestriction(state, rule.id), (error) => error.statusCode === 409);
  const { rules, events } = describeRestrictions(state);
  assert.equal(rules.some((item) => item.id === rule.id && item.status === 'expired'), true);
  assert.equal(events.some((event) => event.ruleId === rule.id && event.type === 'register'), true);
});

test('登记参数会被严格校验', () => {
  const state = createInitialState({ seed: 'restriction-validate' });
  state.day = 3;

  assert.throws(() => register(state, { islandId: 'skyport' }), /天枢邮港/);
  assert.throws(() => register(state, { islandId: 'unknown' }), /找不到岛屿/);
  assert.throws(() => register(state, { startHour: 12, endHour: 12 }), /结束时间必须晚于/);
  assert.throws(() => register(state, { priority: 99 }), /优先级/);
  assert.throws(() => register(state, { reason: '' }), /事由/);
  assert.throws(() => register(state, { startDay: 2, startHour: 12, endDay: 3, endHour: 18 }), /已经过去的日期/);
});

test('管制窗口内向该岛投递会使方案非法并在航段上标注管制信息', () => {
  const state = createInitialState({ seed: 'restriction-block' });
  const letter = state.letters.find((item) => item.recipientIslandId === 'sun');
  assert.ok(letter, '种子应至少有一封寄往曦光岛的邮件');
  register(state, {
    islandId: 'sun',
    startDay: state.day,
    startHour: 0,
    endDay: state.day,
    endHour: 23
  });

  const assignment = {
    letterId: letter.id,
    courierId: 'comet',
    targetIslandId: 'sun',
    order: 0
  };
  const preview = previewPlan(state, [assignment]);

  assert.equal(preview.valid, false);
  const issue = preview.issues.find((item) => item.code === 'ISLAND_RESTRICTED');
  assert.ok(issue);
  assert.equal(issue.ruleId, 'R001');
  const routeLetter = preview.routes[0].letters[0];
  assert.equal(routeLetter.restricted, true);
  assert.equal(routeLetter.restrictionRuleId, 'R001');
  assert.throws(() => advanceDay(state, [assignment]), GameRuleError);
});

test('高优先级窗口不覆盖低优先级窗口之外的时段，边界时刻可以投递', () => {
  const state = createInitialState({ seed: 'restriction-boundary' });
  const letter = state.letters.find((item) => item.recipientIslandId === 'sun');
  assert.ok(letter);
  // 只封锁 9:00-10:00；邮件 7 点出航后通常在 8 点多抵达，应保持合法。
  register(state, { islandId: 'sun', startHour: 9, endHour: 10 });

  const assignment = {
    letterId: letter.id,
    courierId: 'comet',
    targetIslandId: 'sun',
    order: 0
  };
  const preview = previewPlan(state, [assignment]);
  const arrivalHour = preview.routes[0]?.letters[0]?.arrivalHour;
  if (arrivalHour < 9 || arrivalHour >= 10) {
    assert.equal(preview.valid, true);
    assert.equal(preview.routes[0].letters[0].restricted, false);
  } else {
    assert.equal(preview.valid, false);
  }
});

test('每次登记与撤销都会递增版本号', () => {
  const state = createInitialState({ seed: 'restriction-revision' });
  const before = state.revision;
  const { rule } = register(state);
  assert.equal(state.revision, before + 1);
  revokeRestriction(state, rule.id, '');
  assert.equal(state.revision, before + 2);
});

test('状态标签覆盖全部管制生命周期', () => {
  for (const status of ['active', 'scheduled', 'expired', 'revoked']) {
    assert.ok(CONTROL_STATUS_LABELS[status]);
  }
});

test('公开游戏状态会派生管制状态与岛名，但不修改原始存档', () => {
  const state = createInitialState({ seed: 'restriction-public' });
  register(state, { startDay: state.day + 2, startHour: 8, endDay: state.day + 2, endHour: 10 });

  assert.equal(state.restrictions[0].status, undefined);
  const publicState = publicGameState(state);
  assert.equal(publicState.restrictions[0].status, 'scheduled');
  assert.equal(publicState.restrictions[0].islandName, '曦光岛');
  assert.equal(state.restrictions[0].islandName, undefined);
});
