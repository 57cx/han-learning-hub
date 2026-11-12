export const TZ = "Asia/Shanghai";

export function shanghaiDateKey(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function weekdayZh(dateKey) {
  const date = new Date(`${dateKey}T12:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    weekday: "long",
  }).format(date);
}

export function formatDateZh(dateKey) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateTimeZh(input) {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function eachDate(fromKey, toKey) {
  const out = [];
  let cursor = new Date(`${fromKey}T12:00:00+08:00`);
  const end = new Date(`${toKey}T12:00:00+08:00`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(shanghaiDateKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

export function todayKey(now = new Date()) {
  return shanghaiDateKey(now);
}

export function dateKeyFrom(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return shanghaiDateKey(text);
}
