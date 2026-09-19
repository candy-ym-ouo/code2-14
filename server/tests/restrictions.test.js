import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDay, createInitialState, previewPlan } from '../engine.js';
import {
  compareRestrictionPriority,
  findEffectiveRestrictions,
  getRestrictionStatus,
  registerRestriction,
  revokeRestriction,
  windowsOverlap
} from '../restrictions.js';

function register(state, overrides = {}) {
  return registerRestriction(state, {
    islandId: 'sun',
    startDay: state.day,
    startHour: 0,
    endDay: state.day,
    endHour: 24,
    priority: 5,
    reason: '临时风暴管制',
    ...overrides
  });
}

function firstAssignmentFor(state, courierId = 'comet', targetIslandId) {
  const letter = state.letters.find((item) => item.status === 'inbox');
  return {
    letterId: letter.id,
    courierId,
    targetIslandId: targetIslandId || letter.recipientIslandId,
    order: 0
  };
}

test('管制登记写入台账与追加式审计日志', () => {
  const state = createInitialState({ seed: 'restriction-register' });
  const record = register(state, { islandId: 'mist', startDay: 2, endDay: 3, startHour: 9, endHour: 17, reason: '档案馆修缮' });

  assert.equal(record.id, 'R-0001');
  assert.equal(record.sequence, 1);
  assert.equal(state.restrictions.length, 1);
  assert.equal(state.restrictionSeq, 1);
  assert.equal(state.restrictionAudit.length, 1);
  assert.equal(state.restrictionAudit[0].type, 'register');
  assert.equal(state.restrictionAudit[0].restrictionId, 'R-0001');
  assert.equal(getRestrictionStatus(record, state.day), 'upcoming');
});

test('抵达时刻落入管制窗口时方案被拦截且无法结算', () => {
  const state = createInitialState({ seed: 'restriction-block' });
  const assignment = firstAssignmentFor(state);
  register(state, { islandId: assignment.targetIslandId, startHour: 0, endHour: 24 });

  const preview = previewPlan(state, [assignment]);
  assert.equal(preview.valid, false);
  assert.equal(preview.issues.some((issue) => issue.code === 'TARGET_RESTRICTED'), true);
  assert.throws(
    () => advanceDay(state, [assignment]),
    (error) => error.issues.some((issue) => issue.code === 'TARGET_RESTRICTED')
  );
  assert.equal(state.day, 1);
});

test('管制窗口之外的抵达照常放行', () => {
  const state = createInitialState({ seed: 'restriction-pass' });
  const assignment = firstAssignmentFor(state);
  register(state, { islandId: assignment.targetIslandId, startHour: 20, endHour: 23 });

  const preview = previewPlan(state, [assignment]);
  assert.equal(preview.valid, true);
  assert.equal(preview.issues.length, 0);
});

test('其他岛屿的管制不影响本岛投递', () => {
  const state = createInitialState({ seed: 'restriction-other-island' });
  const assignment = firstAssignmentFor(state);
  register(state, { islandId: 'forge', startHour: 0, endHour: 24 });

  const preview = previewPlan(state, [assignment]);
  assert.equal(preview.valid, true);
});

test('未来日期的管制不会拦截今日投递', () => {
  const state = createInitialState({ seed: 'restriction-future' });
  const assignment = firstAssignmentFor(state);
  register(state, { islandId: assignment.targetIslandId, startDay: 3, endDay: 5 });

  assert.equal(findEffectiveRestrictions(state, 1, 10, assignment.targetIslandId).length, 0);
  assert.equal(previewPlan(state, [assignment]).valid, true);
});

test('重叠窗口按优先级数值决定，同优先级先登记者优先', () => {
  const state = createInitialState({ seed: 'restriction-priority' });
  const low = register(state, { islandId: 'sun', startHour: 8, endHour: 18, priority: 3, reason: '低优先级演习' });
  const high = register(state, { islandId: 'sun', startHour: 10, endHour: 14, priority: 8, reason: '高优先级封岛' });
  const same = register(state, { islandId: 'sun', startHour: 6, endHour: 9, priority: 8, reason: '同优先级后登记' });

  assert.equal(windowsOverlap(low, high), true);
  assert.ok(compareRestrictionPriority(high, low) < 0);
  assert.ok(compareRestrictionPriority(low, high) > 0);
  assert.ok(compareRestrictionPriority(high, same) < 0);

  const winners = findEffectiveRestrictions(state, 1, 12, 'sun');
  assert.equal(winners[0].id, high.id);
  assert.deepEqual(winners.map((item) => item.id), [high.id, low.id]);

  // 9 点时高优先级窗口未覆盖，低优先级与同优先级窗口都覆盖，先登记者（low 序号更小，但 low 优先级更低）；
  // 9 点恰为 same 的闭区间端点，优先级 8 高于 low 的 3，因此 same 胜出。
  const atNine = findEffectiveRestrictions(state, 1, 9, 'sun');
  assert.equal(atNine[0].id, same.id);
});

test('撤销管制后投递恢复，撤销记录与审计事件保留', () => {
  const state = createInitialState({ seed: 'restriction-revoke' });
  const assignment = firstAssignmentFor(state);
  const record = register(state, { islandId: assignment.targetIslandId, startHour: 0, endHour: 24 });

  assert.equal(previewPlan(state, [assignment]).valid, false);
  revokeRestriction(state, record.id, { revokeReason: '风暴提前解除' });

  assert.equal(state.restrictions.length, 1);
  assert.ok(state.restrictions[0].revokedAt);
  assert.equal(state.restrictionAudit.length, 2);
  assert.equal(state.restrictionAudit[1].type, 'revoke');
  assert.equal(previewPlan(state, [assignment]).valid, true);
});

test('已撤销和已过期的规则不能重复撤销', () => {
  const state = createInitialState({ seed: 'restriction-revoke-guards' });
  const revoked = register(state, { startDay: 1, endDay: 2, startHour: 0, endHour: 24 });
  revokeRestriction(state, revoked.id);
  assert.throws(() => revokeRestriction(state, revoked.id), /已经撤销/);

  const expired = register(state, { startDay: 1, endDay: 1, startHour: 6, endHour: 10, reason: '清晨封锁' });
  state.day = 5;
  assert.equal(getRestrictionStatus(expired, state.day), 'expired');
  assert.throws(() => revokeRestriction(state, expired.id), /已过期/);
});

test('过期的管制记录仍留在台账中可追溯', () => {
  const state = createInitialState({ seed: 'restriction-audit-trace' });
  const record = register(state, { startDay: 1, endDay: 1, startHour: 6, endHour: 10, reason: '首日晨雾' });
  state.day = 4;

  assert.equal(getRestrictionStatus(record, state.day), 'expired');
  assert.equal(state.restrictions.length, 1);
  assert.equal(state.restrictionAudit.length, 1);
  assert.equal(state.restrictionAudit[0].reason, '首日晨雾');
});

test('登记参数执行完整校验', () => {
  const state = createInitialState({ seed: 'restriction-validation' });

  assert.throws(() => register(state, { islandId: 'skyport' }), /不可被管制/);
  assert.throws(() => register(state, { islandId: 'sun', startDay: 2, endDay: 1, endHour: 24 }), /结束日期不能早于/);
  assert.throws(() => register(state, { islandId: 'sun', startHour: 14, endHour: 9 }), /结束时刻必须晚于/);
  assert.throws(() => register(state, { islandId: 'sun', priority: 99, endHour: 24 }), /优先级/);
  assert.throws(() => register(state, { islandId: 'sun', endHour: 24, reason: 'x' }), /管制事由/);
});

test('跨日窗口在次日时刻依然有效，结束之后立即失效', () => {
  const state = createInitialState({ seed: 'restriction-multiday' });
  register(state, { islandId: 'sun', startDay: 1, startHour: 18, endDay: 2, endHour: 10, reason: '夜间宵禁' });

  assert.equal(findEffectiveRestrictions(state, 1, 20, 'sun').length, 1);
  assert.equal(findEffectiveRestrictions(state, 2, 9, 'sun').length, 1);
  assert.equal(findEffectiveRestrictions(state, 2, 10, 'sun').length, 1);
  assert.equal(findEffectiveRestrictions(state, 2, 11, 'sun').length, 0);
});
