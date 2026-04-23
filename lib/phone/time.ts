import type { PhoneWeekday } from './types';

const WEEKDAY_MAP: Record<string, PhoneWeekday> = {
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
  sun: 'sun',
};

function formatterParts(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
}

export function normalizeWeekday(value: string): PhoneWeekday | null {
  return WEEKDAY_MAP[value.trim().slice(0, 3).toLowerCase()] ?? null;
}

export function parseTimeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}

export function getZonedDateKey(date: Date, timeZone: string): string {
  const parts = formatterParts(date, timeZone);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getZonedWeekday(date: Date, timeZone: string): PhoneWeekday {
  const weekday = formatterParts(date, timeZone).find((part) => part.type === 'weekday')?.value ?? 'Mon';
  return normalizeWeekday(weekday) ?? 'mon';
}

export function getZonedMinutesIntoDay(date: Date, timeZone: string): number {
  const parts = formatterParts(date, timeZone);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function isWithinBusinessWindow(
  date: Date,
  timeZone: string,
  activeWeekdays: PhoneWeekday[],
  startTime: string,
  endTime: string,
): boolean {
  const weekday = getZonedWeekday(date, timeZone);
  if (!activeWeekdays.includes(weekday)) return false;

  const currentMinutes = getZonedMinutesIntoDay(date, timeZone);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function formatDayLabel(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${month}/${day}`;
}
