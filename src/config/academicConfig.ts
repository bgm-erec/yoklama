export interface AcademicCalendarConfig {
  /**
   * ISO date string (YYYY-MM-DD) for Week 1 Monday in Europe/Istanbul timezone.
   * Extracted from code into configuration so term start dates can be updated in one place.
   */
  termStartMondayIso: string;
  /**
   * IANA timezone used for all week calculations regardless of user device timezone.
   */
  timeZone: string;
  /**
   * Maximum academic week count for a term.
   */
  maxWeeks: number;
}

const envStartMonday =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_TERM_START_MONDAY;

export const ACADEMIC_CONFIG: AcademicCalendarConfig = {
  termStartMondayIso: envStartMonday || '2026-10-19',
  timeZone: 'Europe/Istanbul',
  maxWeeks: 52,
};

/**
 * Standard total semester/term weeks count (used in week selector and coordinator tracking).
 */
export const TOTAL_TERM_WEEKS = 12;

/**
 * Offset in milliseconds between trusted server clock and local device clock:
 * trustedTimeMs = Date.now() + serverClockOffsetMs
 */
let serverClockOffsetMs = 0;
let lastMeasuredSkewMinutes = 0;

export function setServerClockOffsetMs(offsetMs: number): void {
  if (!Number.isFinite(offsetMs)) return;
  serverClockOffsetMs = offsetMs;
  lastMeasuredSkewMinutes = Math.round(Math.abs(offsetMs) / 60000);
}

export function getServerClockOffsetMs(): number {
  return serverClockOffsetMs;
}

export function getClockSkewMinutes(): number {
  return lastMeasuredSkewMinutes;
}

export function isClockSkewSignificant(): boolean {
  return lastMeasuredSkewMinutes >= 30;
}

/**
 * Returns the current Date adjusted by the measured server clock offset,
 * protecting week calculations against an incorrect device clock.
 */
export function getTrustedNow(): Date {
  return new Date(Date.now() + serverClockOffsetMs);
}

/**
 * Fetches trusted network time from the HTTP Date header of the origin/Google endpoints
 * so that week calculation remains accurate even if the user's device clock is wrong.
 */
export async function syncServerClockOffset(): Promise<number> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return 0;
  }
  try {
    const before = Date.now();
    const res = await fetch(window.location.href.split('#')[0], {
      method: 'HEAD',
      cache: 'no-store',
    });
    const after = Date.now();
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const serverMs = Date.parse(dateHeader);
      if (!Number.isNaN(serverMs)) {
        const midpoint = (before + after) / 2;
        const offset = serverMs - midpoint;
        setServerClockOffsetMs(offset);
        return offset;
      }
    }
  } catch (err) {
    console.warn('Sunucu saati senkronize edilemedi, cihaz saati kullanılıyor:', err);
  }
  return serverClockOffsetMs;
}

/**
 * Extracts calendar { year, month (1-12), day (1-31) } in the configured timezone (Europe/Istanbul).
 */
export function getZonedDateParts(
  date: Date,
  timeZone: string = ACADEMIC_CONFIG.timeZone
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  let year = 2026;
  let month = 10;
  let day = 19;
  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    if (part.type === 'month') month = Number(part.value);
    if (part.type === 'day') day = Number(part.value);
  }
  return { year, month, day };
}

/**
 * Parses an ISO YYYY-MM-DD date string into a UTC midnight timestamp for pure calendar-day math.
 */
export function parseIsoDateToUtcMidnightMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y || 2026, (m || 10) - 1, d || 19, 0, 0, 0, 0);
}
