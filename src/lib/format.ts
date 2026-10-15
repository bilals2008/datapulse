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

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function bytesToGb(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}
