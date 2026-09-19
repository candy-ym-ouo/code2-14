import { useEffect, useState } from 'react';
import { restrictionApi } from '../api.js';
import { formatClockHour, formatEventTime } from '../utils.js';

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 10;

const STATUS_TABS = [
  { key: 'active', label: '生效中' },
  { key: 'scheduled', label: '待生效' },
  { key: 'expired', label: '已过期' },
  { key: 'revoked', label: '已撤销' }
];

const STATUS_CLASS = {
  active: 'status-active',
  scheduled: 'status-scheduled',
  expired: 'status-expired',
  revoked: 'status-revoked'
};

function StatusBadge({ status }) {
  const tab = STATUS_TABS.find((item) => item.key === status);
  return <span className={`restriction-status ${STATUS_CLASS[status] || ''}`}>{tab?.label || status}</span>;
}

function WindowText({ rule }) {
  return (
    <code>
      第 {rule.startDay} 日 {formatClockHour(rule.startHour)} → 第 {rule.endDay} 日 {formatClockHour(rule.endHour)}
    </code>
  );
}

function RegisterForm({ game, busy, setBusy, onRegistered, onError }) {
  const islands = game.islands.filter((island) => island.id !== 'skyport');
  const [islandId, setIslandId] = useState(islands[0]?.id || '');
  const [startDay, setStartDay] = useState(game.day);
  const [startHour, setStartHour] = useState(7);
  const [endDay, setEndDay] = useState(game.day);
  const [endHour, setEndHour] = useState(12);
  const [priority, setPriority] = useState(5);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [overlaps, setOverlaps] = useState(null);

  useEffect(() => {
    setStartDay((current) => (Number(current) < game.day ? game.day : Number(current)));
    setEndDay((current) => Math.max(Number(current), game.day));
  }, [game.day]);

  async function submit(event) {
    event.preventDefault();
    onError('');
    setOverlaps(null);
    setBusy(true);
    try {
      const result = await restrictionApi.register({
        islandId,
        startDay: Number(startDay),
        startHour: Number(startHour),
        endDay: Number(endDay),
        endHour: Number(endHour),
        priority: Number(priority),
        reason,
        note
      });
      setReason('');
      setNote('');
      setOverlaps(result.overlaps || []);
      onRegistered(result.state);
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="restriction-form" onSubmit={submit}>
      <label className="restriction-field span-2">
        <span>管制岛屿</span>
        <select value={islandId} onChange={(event) => setIslandId(event.target.value)} disabled={busy}>
          {islands.map((island) => <option key={island.id} value={island.id}>{island.name}</option>)}
        </select>
      </label>

      <fieldset className="restriction-window span-2">
        <legend>管制时段（半开区间，结束时刻准时解除）</legend>
        <div className="window-inputs">
          <label>
            <span>起始 第</span>
            <input type="number" min={1} max={game.days} value={startDay}
              onChange={(event) => setStartDay(event.target.value)} disabled={busy} />
            <span>日</span>
          </label>
          <label>
            <input type="number" min={0} max={23} value={startHour}
              onChange={(event) => setStartHour(event.target.value)} disabled={busy} />
            <span>:00</span>
          </label>
          <i>→</i>
          <label>
            <span>结束 第</span>
            <input type="number" min={1} max={game.days} value={endDay}
              onChange={(event) => setEndDay(event.target.value)} disabled={busy} />
            <span>日</span>
          </label>
          <label>
            <input type="number" min={0} max={23} value={endHour}
              onChange={(event) => setEndHour(event.target.value)} disabled={busy} />
            <span>:00</span>
          </label>
        </div>
      </fieldset>

      <label className="restriction-field">
        <span>优先级（{MIN_PRIORITY}–{MAX_PRIORITY}，高者覆盖低者）</span>
        <input type="number" min={MIN_PRIORITY} max={MAX_PRIORITY} value={priority}
          onChange={(event) => setPriority(event.target.value)} disabled={busy} />
      </label>
      <label className="restriction-field">
        <span>事由</span>
        <input type="text" maxLength={40} placeholder="如：风暴警戒 / 航道检修" value={reason}
          onChange={(event) => setReason(event.target.value)} disabled={busy} />
      </label>
      <label className="restriction-field span-2">
        <span>备注（可选）</span>
        <input type="text" maxLength={120} placeholder="补充说明会一并写入审计台账" value={note}
          onChange={(event) => setNote(event.target.value)} disabled={busy} />
      </label>

      <div className="restriction-form-actions span-2">
        <button type="submit" className="restriction-submit" disabled={busy || !islandId || !reason.trim()}>
          {busy ? '登记中...' : '登记临时管制'}
        </button>
      </div>

      {overlaps !== null && overlaps.length > 0 && (
        <div className="overlap-notice span-2" role="status">
          <strong>与 {overlaps.length} 条同岛窗口重叠：</strong>
          <ul>
            {overlaps.map((item) => (
              <li key={item.ruleId}>
                <code>{item.ruleId}</code>（优先级 {item.priority}，{item.reason}）——
                {item.precedence === 'newer'
                  ? '重叠时段以新登记规则为准'
                  : '对方优先级更高，重叠时段仍由对方主导'}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setOverlaps(null)}>知道了</button>
        </div>
      )}
    </form>
  );
}

function RuleRow({ rule, busy, onRevoke }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const revocable = rule.status === 'active' || rule.status === 'scheduled';

  async function submitRevoke(event) {
    event.preventDefault();
    await onRevoke(rule, reason.trim());
    setConfirming(false);
    setReason('');
  }

  return (
    <article className={`restriction-row ${STATUS_CLASS[rule.status]}`}>
      <div className="restriction-row-main">
        <div className="restriction-row-head">
          <code>{rule.id}</code>
          <strong>{rule.islandName}</strong>
          <StatusBadge status={rule.status} />
          <span className="restriction-priority">P{rule.priority}</span>
        </div>
        <div className="restriction-row-meta">
          <WindowText rule={rule} />
          <span>{rule.reason}</span>
          {rule.note && <em>{rule.note}</em>}
        </div>
        {rule.status === 'revoked' && (
          <div className="restriction-row-revoked">
            {formatEventTime(rule.revokedAt)} 撤销{rule.revokedReason ? `：${rule.revokedReason}` : ''}
          </div>
        )}
      </div>
      {revocable && (
        <div className="restriction-row-actions">
          {confirming ? (
            <form className="revoke-form" onSubmit={submitRevoke}>
              <input type="text" maxLength={120} placeholder="撤销说明（可选，写入台账）" value={reason}
                onChange={(event) => setReason(event.target.value)} disabled={busy} autoFocus />
              <button type="submit" className="revoke-confirm" disabled={busy}>确认撤销</button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy}>取消</button>
            </form>
          ) : (
            <button type="button" className="revoke-button" disabled={busy} onClick={() => setConfirming(true)}>撤销</button>
          )}
        </div>
      )}
    </article>
  );
}

function AuditLedger({ game }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      setLoadingAudit(true);
      try {
        setData(await restrictionApi.audit());
      } catch {
        // 台账加载失败时保留面板，用户可再次展开重试。
      } finally {
        setLoadingAudit(false);
      }
    }
  }

  const ruleMap = new Map((data?.rules || []).map((rule) => [rule.ruleId, rule]));

  return (
    <div className="restriction-audit">
      <button type="button" className="audit-toggle" onClick={toggle}>
        {open ? '收起审计台账' : `展开审计台账（${game.restrictionEvents?.length || 0} 条事件）`}
      </button>
      {open && (
        <div className="audit-ledger">
          {loadingAudit && <p className="audit-empty">正在读取不可篡改台账...</p>}
          {data?.events?.length === 0 && <p className="audit-empty">暂无登记或撤销记录。</p>}
          {data?.events?.map((event) => {
            const rule = ruleMap.get(event.ruleId);
            return (
              <div key={`${event.type}-${event.sequence}`} className={`audit-entry audit-${event.type}`}>
                <span className="audit-type">{event.type === 'register' ? '登记' : '撤销'}</span>
                <code>{event.ruleId}</code>
                <strong>{rule?.islandName || event.islandId}</strong>
                {event.type === 'register' && rule && <WindowText rule={rule} />}
                {event.type === 'register' && <span>P{event.priority} · {event.reason}</span>}
                {event.type === 'revoke' && <span>{event.reason || '（未填写撤销说明）'}</span>}
                <time>{formatEventTime(event.at)}</time>
              </div>
            );
          })}
          <p className="audit-hint">过期与已撤销记录只做归档，不再参与投递裁决。</p>
        </div>
      )}
    </div>
  );
}

export default function ControlPanel({ game, onStateChange, onError }) {
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('active');
  const rules = (game.restrictions || [])
    .filter((rule) => rule.status === tab)
    .sort((first, second) => second.sequence - first.sequence);
  const counts = STATUS_TABS.reduce((map, item) => {
    map[item.key] = (game.restrictions || []).filter((rule) => rule.status === item.key).length;
    return map;
  }, {});

  async function handleRevoke(rule, reason) {
    setBusy(true);
    onError('');
    try {
      const result = await restrictionApi.revoke(rule.id, reason);
      onStateChange(result.state);
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel control-panel" aria-labelledby="control-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">岛屿临时管制登记</p>
          <h2 id="control-title">管制窗口</h2>
        </div>
        <span className="map-status"><i /> 按时间段暂停投递</span>
      </div>

      <RegisterForm game={game} busy={busy} setBusy={setBusy} onRegistered={onStateChange} onError={onError} />

      <div className="restriction-tabs" role="tablist">
        {STATUS_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'active' : ''}
            onClick={() => setTab(item.key)}
          >
            {item.label} <b>{counts[item.key]}</b>
          </button>
        ))}
      </div>

      <div className="restriction-list">
        {rules.length === 0 ? (
          <p className="restriction-empty">当前没有{STATUS_TABS.find((item) => item.key === tab)?.label}的管制记录。</p>
        ) : rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} busy={busy} onRevoke={handleRevoke} />
        ))}
      </div>

      <AuditLedger game={game} />
    </section>
  );
}
