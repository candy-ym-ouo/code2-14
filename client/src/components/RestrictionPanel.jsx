import { useState } from 'react';
import { restrictionApi } from '../api.js';
import { RESTRICTION_STATUS, formatAuditTime } from '../restrictions.js';

const HOURS = Array.from({ length: 25 }, (_, value) => value);

function hourOption(value) {
  return `${String(value).padStart(2, '0')}:00`;
}

function RecordRow({ record, busy, onRevoke }) {
  const status = RESTRICTION_STATUS[record.status] || RESTRICTION_STATUS.expired;
  const revocable = !record.revokedAt && record.status !== 'expired';

  return (
    <li className={`restriction-record ${status.className}`}>
      <div className="restriction-record-head">
        <code>{record.id}</code>
        <span className={`restriction-status ${status.className}`}>{status.label}</span>
        <span className="restriction-priority">
          P{record.priority}
        </span>
        {record.dominant && <em className="restriction-dominant" title="与其他窗口重叠时本规则优先级最高">主导</em>}
      </div>
      <div className="restriction-record-body">
        <strong>{record.islandName}</strong>
        <span>{record.window}</span>
      </div>
      <p className="restriction-reason">{record.reason}</p>
      <div className="restriction-record-foot">
        <span>{record.registeredBy} · {formatAuditTime(record.registeredAt)}</span>
        {revocable ? (
          <button
            type="button"
            className="restriction-revoke"
            disabled={busy}
            onClick={() => onRevoke(record)}
          >
            撤销
          </button>
        ) : record.revokedAt ? (
          <small title={record.revokeReason}>由 {record.revokedBy} 撤销</small>
        ) : null}
      </div>
      {record.overlaps.length > 0 && (
        <p className="restriction-overlap">
          重叠窗口：{record.overlaps.map((other) => other.id).join('、')}
          {!record.revokedAt && !record.domestic && '（本规则优先级较低，重叠时刻不生效）'}
        </p>
      )}
    </li>
  );
}

function AuditTimeline({ audit }) {
  if (!audit.length) {
    return <p className="restriction-empty">暂无登记记录。</p>;
  }
  return (
    <ol className="restriction-audit">
      {[...audit].reverse().map((event) => (
        <li key={event.id} className={`audit-event ${event.type}`}>
          <span className="audit-badge">{event.type === 'register' ? '登记' : '撤销'}</span>
          <code>{event.restrictionId}</code>
          <span>{event.islandName}</span>
          <small>{event.reason}</small>
          <i>{event.by} · {formatAuditTime(event.at)}</i>
        </li>
      ))}
    </ol>
  );
}

const EMPTY_FORM = {
  islandId: '',
  startHour: 8,
  endHour: 12,
  priority: 5,
  reason: '',
  registeredBy: ''
};

export default function RestrictionPanel({ game, busy: externalBusy, onChanged }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, startDay: game.day, endDay: game.day });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const view = game.restrictionView;
  const records = view?.records || [];
  const effective = records.filter((record) => record.status === 'active');
  const upcoming = records.filter((record) => record.status === 'upcoming');
  const archived = records
    .filter((record) => record.status === 'expired' || record.status === 'revoked')
    .sort((first, second) => second.sequence - first.sequence);
  const targetIslands = game.islands.filter((island) => island.id !== 'skyport');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        islandId: form.islandId,
        startDay: Number(form.startDay),
        startHour: Number(form.startHour),
        endDay: Number(form.endDay),
        endHour: Number(form.endHour),
        priority: Number(form.priority),
        reason: form.reason,
        registeredBy: form.registeredBy.trim() || undefined
      };
      const result = await restrictionApi.register(payload);
      onChanged?.(result.state);
      setForm({
        ...EMPTY_FORM,
        islandId: form.islandId,
        startDay: result.state.day,
        endDay: result.state.day
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(record) {
    if (!window.confirm(`确定撤销 ${record.id}（${record.islandName} ${record.window}）吗？记录仍会保留在审计台账中。`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await restrictionApi.revoke(record.id, { revokeReason: '调度撤销' });
      onChanged?.(result.state);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const locked = externalBusy || game.phase !== 'planning';

  return (
    <section className="panel restriction-panel" aria-labelledby="restriction-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">临时航管令</p>
          <h2 id="restriction-title">岛屿管制登记</h2>
        </div>
        <span className="restriction-count">生效 {effective.length} 条</span>
      </div>

      <p className="restriction-rule-note">按日期与时刻限制目标投递；{view?.priorityRule || '优先级数值越大越先生效，同值先登记者优先。'}</p>

      <form className="restriction-form" onSubmit={submit}>
        <label className="restriction-field span-two">
          <span>管制岛屿</span>
          <select value={form.islandId} disabled={locked || busy} onChange={(event) => update('islandId', event.target.value)} required>
            <option value="" disabled>选择岛屿</option>
            {targetIslands.map((island) => (
              <option key={island.id} value={island.id}>{island.name} · {island.code}</option>
            ))}
          </select>
        </label>
        <label className="restriction-field">
          <span>开始日</span>
          <input
            type="number"
            min={game.day}
            max={game.days}
            value={form.startDay}
            disabled={locked || busy}
            onChange={(event) => update('startDay', event.target.value)}
          />
        </label>
        <label className="restriction-field">
          <span>结束日</span>
          <input
            type="number"
            min={game.day}
            max={game.days}
            value={form.endDay}
            disabled={locked || busy}
            onChange={(event) => update('endDay', event.target.value)}
          />
        </label>
        <label className="restriction-field">
          <span>开始时刻</span>
          <select value={form.startHour} disabled={locked || busy} onChange={(event) => update('startHour', event.target.value)}>
            {HOURS.map((value) => <option key={value} value={value}>{hourOption(value)}</option>)}
          </select>
        </label>
        <label className="restriction-field">
          <span>结束时刻</span>
          <select value={form.endHour} disabled={locked || busy} onChange={(event) => update('endHour', event.target.value)}>
            {HOURS.map((value) => <option key={value} value={value}>{hourOption(value)}</option>)}
          </select>
        </label>
        <label className="restriction-field">
          <span>优先级 1-10</span>
          <select value={form.priority} disabled={locked || busy} onChange={(event) => update('priority', event.target.value)}>
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>P{value}{value === 5 ? '（默认）' : ''}</option>
            ))}
          </select>
        </label>
        <label className="restriction-field span-two">
          <span>管制事由</span>
          <input
            type="text"
            maxLength={120}
            placeholder="例如：风暴过境，禁止午间降落"
            value={form.reason}
            disabled={locked || busy}
            onChange={(event) => update('reason', event.target.value)}
            required
          />
        </label>
        <label className="restriction-field span-two">
          <span>登记者（可选）</span>
          <input
            type="text"
            maxLength={40}
            placeholder="默认：值班调度员"
            value={form.registeredBy}
            disabled={locked || busy}
            onChange={(event) => update('registeredBy', event.target.value)}
          />
        </label>
        {error && <p className="restriction-error" role="alert">{error}</p>}
        <button type="submit" className="restriction-submit" disabled={locked || busy}>
          {busy ? '登记中...' : '登记管制'}
        </button>
      </form>

      {effective.length === 0 && upcoming.length === 0 && archived.length === 0 && (
        <p className="restriction-empty">当前没有任何管制记录。</p>
      )}

      {(effective.length > 0 || upcoming.length > 0) && (
        <ul className="restriction-live-list">
          {effective.map((record) => (
            <RecordRow key={record.id} record={record} busy={locked} onRevoke={revoke} />
          ))}
          {upcoming.map((record) => (
            <RecordRow key={record.id} record={record} busy={locked} onRevoke={revoke} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="restriction-archive">
          <summary>历史台账（过期 {records.filter((r) => r.status === 'expired').length} · 已撤销 {records.filter((r) => r.status === 'revoked').length}）</summary>
          <ul className="restriction-live-list archived">
            {archived.map((record) => (
              <RecordRow key={record.id} record={record} busy={locked} onRevoke={revoke} />
            ))}
          </ul>
        </details>
      )}

      <details className="restriction-audit-box" open={showAudit} onToggle={(event) => setShowAudit(event.currentTarget.open)}>
        <summary>审计事件流（{(view?.audit || []).length}）</summary>
        <AuditTimeline audit={view?.audit || []} />
      </details>
    </section>
  );
}
