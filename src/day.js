// Product-day helpers. The Daily Horoscope day cuts over at 06:00 IST (not
// midnight): the nightly batch is published by 06:00 and the page quietly
// reloads across the same boundary, so "aaj ka rashifal" opens with the
// morning ritual. Every pod computes the same day for the same instant, so
// content publishing and reads all roll over together.
//
// NOTE: the reset-time math assumes an IST (+05:30, no DST) product day.
const DAY_TZ = process.env.DAY_TZ || 'Asia/Kolkata';
const DAY_START_HOUR = Number(process.env.DAY_START_HOUR ?? 6);
const TZ_OFFSET = '+05:30';
const HOUR_MS = 3_600_000;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: DAY_TZ }); // YYYY-MM-DD

// The product day is the IST calendar day of (now - DAY_START_HOUR): at
// 05:59 IST you still read yesterday's horoscope; at 06:00 the new day opens.
export function todayKey(date = new Date()) {
  return dayFmt.format(new Date(date.getTime() - DAY_START_HOUR * HOUR_MS));
}

// Instant the current product day ends (next 06:00 IST) — the client uses it
// to quietly reload onto the new day's content.
export function nextResetAt(date = new Date()) {
  const dayStartMs =
    Date.parse(`${todayKey(date)}T00:00:00${TZ_OFFSET}`) + DAY_START_HOUR * HOUR_MS;
  return new Date(dayStartMs + 24 * HOUR_MS);
}

// day-1 in YYYY-MM-DD, used for the "serve yesterday's content" fallback.
export function previousDayKey(dayKey) {
  const d = new Date(Date.parse(`${dayKey}T12:00:00${TZ_OFFSET}`) - 24 * HOUR_MS);
  return dayFmt.format(d);
}

// day+1 in YYYY-MM-DD — the nightly pre-generation target: tomorrow's batch
// is written tonight so the 06:00 cutover serves content that already exists.
export function nextDayKey(dayKey) {
  const d = new Date(Date.parse(`${dayKey}T12:00:00${TZ_OFFSET}`) + 24 * HOUR_MS);
  return dayFmt.format(d);
}

// Noon IST of a product day as a Date — the reference instant for that day's
// astronomy (moon sign), so every pod derives identical transit facts.
export function dayNoon(dayKey) {
  return new Date(Date.parse(`${dayKey}T12:00:00${TZ_OFFSET}`));
}
