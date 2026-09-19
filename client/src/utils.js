export function formatHour(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return '--:--';

  const totalMinutes = Math.round(numericValue * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatClockHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
