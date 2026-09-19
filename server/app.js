import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { advanceDay, GameRuleError, previewPlan, publicGameState } from './engine.js';
import { assertPlanningPhase } from './store.js';
import { describeRestrictions, registerRestriction, revokeRestriction } from './restrictions.js';

function getAssignments(body) {
  if (body === undefined || body === null) {
    throw new GameRuleError('请求体必须是 JSON 对象，并提供 assignments 数组。');
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new GameRuleError('请求体必须是 JSON 对象。');
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'assignments')) {
    throw new GameRuleError('请求体必须提供 assignments 数组。');
  }
  if (!Array.isArray(body.assignments)) {
    throw new GameRuleError('assignments 必须是数组。');
  }
  return body.assignments;
}

function assertExpectedRevision(state, expectedRevision) {
  if (!Number.isInteger(expectedRevision)) {
    throw new GameRuleError('提交游戏进度时必须提供整数 expectedRevision。');
  }
  if (state.revision !== expectedRevision) {
    throw new GameRuleError('游戏进度已在其他请求中更新，请刷新后再提交。', [], 409);
  }
}

export function createApp({ store, clientDist }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (request, response) => {
    const state = store.getState();
    response.json({
      ok: true,
      phase: state.phase,
      day: state.day,
      version: state.version
    });
  });

  app.get('/api/game', (request, response) => {
    const state = publicGameState(store.getState());
    const recovery = store.getRecovery?.();
    response.json({ state: recovery ? { ...state, recovery } : state });
  });

  app.post('/api/game/plan/preview', (request, response) => {
    const state = store.getState();
    assertPlanningPhase(state);
    response.json({ preview: previewPlan(state, getAssignments(request.body)) });
  });

  app.post('/api/game/day/advance', (request, response) => {
    const report = store.mutate((state) => {
      assertPlanningPhase(state);
      assertExpectedRevision(state, request.body?.expectedRevision);
      return advanceDay(state, getAssignments(request.body));
    });
    response.json({
      report,
      state: publicGameState(store.getState())
    });
  });

  app.get('/api/restrictions', (request, response) => {
    const { islandId, status } = request.query;
    const filters = {};
    if (typeof islandId === 'string' && islandId) filters.islandId = islandId;
    if (typeof status === 'string' && status) filters.status = status;
    response.json({ restrictions: describeRestrictions(store.getState(), filters) });
  });

  app.get('/api/restrictions/audit', (request, response) => {
    const { islandId } = request.query;
    const filters = islandId ? { islandId: String(islandId) } : {};
    const { events, rules } = describeRestrictions(store.getState(), filters);
    response.json({
      events,
      rules: rules.map((rule) => ({
        ruleId: rule.id,
        islandId: rule.islandId,
        islandName: rule.islandName,
        startDay: rule.startDay,
        startHour: rule.startHour,
        endDay: rule.endDay,
        endHour: rule.endHour,
        priority: rule.priority,
        reason: rule.reason,
        note: rule.note,
        registeredAt: rule.registeredAt,
        revokedAt: rule.revokedAt,
        revokedReason: rule.revokedReason,
        status: rule.status
      }))
    });
  });

  app.post('/api/restrictions', (request, response) => {
    const result = store.mutate((state) => {
      assertPlanningPhase(state);
      return registerRestriction(state, request.body);
    });
    response.status(201).json({
      restriction: result.rule,
      overlaps: result.overlaps,
      state: publicGameState(store.getState())
    });
  });

  app.post('/api/restrictions/:ruleId/revoke', (request, response) => {
    const restriction = store.mutate((state) => {
      assertPlanningPhase(state);
      return revokeRestriction(state, request.params.ruleId, request.body?.reason);
    });
    response.json({ restriction, state: publicGameState(store.getState()) });
  });

  app.post('/api/game/reset', (request, response) => {
    const requestedSeed = request.body?.seed;
    const seed = requestedSeed === undefined || requestedSeed === null || requestedSeed === ''
      ? Date.now()
      : String(requestedSeed);
    const state = store.reset(seed);
    response.json({ state: publicGameState(state) });
  });

  app.use('/api', (request, response) => {
    response.status(404).json({ error: '接口不存在。' });
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((request, response, next) => {
      if (request.method !== 'GET') return next();
      response.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error(error);
    response.status(statusCode).json({
      error: error.message || '服务器发生未知错误。',
      issues: error.issues || undefined
    });
  });

  return app;
}
