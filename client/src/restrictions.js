export const RESTRICTION_STATUS = {
  active: { label: '生效中', className: 'active' },
  upcoming: { label: '待生效', className: 'upcoming' },
  expired: { label: '已过期', className: 'expired' },
  revoked: { label: '已撤销', className: 'revoked' }
};

/** 返回目标岛屿在当日此刻仍有效（未撤销且窗口覆盖）的管制记录。 */
export function activeRestrictionsAt(view, day, hour, islandId) {
  if (!view) return [];
  const moment = day * 24 + hour;
  return view.records
    .filter((record) => (
      !record.revokedAt &&
      record.islandId === islandId &&
      moment >= record.startDay * 24 + record.startHour &&
      moment <= record.endDay * 24 + record.endHour
    ))
    .sort((first, second) => second.priority - first.priority || first.sequence - second.sequence);
}

/** 当日日期粒度生效中的管制（开始时刻即使尚未到点，也提示调度员注意）。 */
export function restrictionsForToday(view, day, islandId) {
  if (!view) return [];
  return view.records.filter((record) => (
    !record.revokedAt &&
    record.islandId === islandId &&
    record.startDay <= day &&
    record.endDay >= day
  ));
}

export function formatAuditTime(isoString) {
  const time = new Date(isoString);
  if (Number.isNaN(time.getTime())) return isoString;
  return time.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
