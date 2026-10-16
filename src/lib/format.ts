import type { UsageRange } from "@/lib/ipc";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function splitBytes(bytes: number): { value: string; unit: string } {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { value: "0", unit: "B" };
  }

  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < UNITS.length - 1) {
    value /= 1024;
    index += 1;
  }

  const digits = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return { value: value.toFixed(digits), unit: UNITS[index] };
}

export function formatBytes(bytes: number): string {
  const { value, unit } = splitBytes(bytes);
  return `${value} ${unit}`;
}

export function formatRate(bytesPerSecond: number): string {
  const { value, unit } = splitBytes(bytesPerSecond);
  return `${value} ${unit}/s`;
}

export function isActiveRate(bytesPerSecond: number): boolean {
  return bytesPerSecond > 512;
}

export function bucketLabel(key: string, range: UsageRange): string {
  if (range === "12m") {
    const [, month] = key.split("-").map(Number);
    return MONTHS[month - 1] ?? key;
  }

  if (range === "today") {
    const [hour] = key.split(" ").slice(1);
    return `${hour}:00`;
  }

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (range === "7d") {
    return WEEKDAYS[date.getDay()] ?? key;
  }

  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function bucketTooltipLabel(key: string, range: UsageRange): string {
  if (range === "12m") {
    const [year, month] = key.split("-").map(Number);
    return `${MONTHS[month - 1]} ${year}`;
  }

  if (range === "today") {
    return `${key}:00`;
  }

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${year}`;
}

export function formatDay(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Human label for a `YYYY-MM-DD` bucket key, e.g. `Mon, 12 May 2026`. */
export function formatDayKey(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date);
  if (Number.isNaN(value.getTime())) return day;
  return `${WEEKDAYS[value.getDay()]}, ${date} ${MONTHS[month - 1]} ${year}`;
}

/** Compact day label for chart axes, e.g. `12 May`. */
export function formatDayKeyShort(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1]}`;
}

/** 12-hour clock label for an hour-of-day (0–23), e.g. `3 PM`. */
export function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const value = hour % 12 === 0 ? 12 : hour % 12;
  return `${value} ${period}`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function bytesToGb(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/** Cost of `bytes` at `ratePerGb`, e.g. `PKR 1,240`. Empty when no rate is set. */
export function formatMoney(
  bytes: number,
  ratePerGb: number,
  currency: string,
): string {
  if (!Number.isFinite(ratePerGb) || ratePerGb <= 0) return "";
  const amount = bytesToGb(bytes) * ratePerGb;
  const value = amount.toLocaleString(undefined, {
    maximumFractionDigits: amount >= 100 ? 0 : 1,
  });
  return `${currency} ${value}`.trim();
}

/** Clock range label for an hour-of-day window, e.g. `2 AM – 6 AM`. */
export function formatHourRange(start: number, end: number): string {
  return `${formatHour(start)} – ${formatHour(end)}`;
}

/** Formats a megabit-per-second rate as megabytes per second. */
export function formatMBps(mbps: number): string {
  if (!Number.isFinite(mbps) || mbps <= 0) return "—";
  const value = mbps / 8;
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} MB/s`;
}

function clock(seconds: number): string {
  const date = new Date(seconds * 1000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function formatDateTime(seconds: number): string {
  const date = new Date(seconds * 1000);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${clock(seconds)}`;
}

export function formatShortDate(seconds: number): string {
  const date = new Date(seconds * 1000);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days) || days >= 9999) {
    return "—";
  }
  if (days < 1) {
    return "< 1 day";
  }
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

