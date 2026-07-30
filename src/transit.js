// Tier A astrology backing (per the E1 spec): Gemini never decides what the
// astrology is — it only phrases the transit facts computed here.
//
// Two real, non-random inputs give daily + monthly variation:
//   1. Transiting Sun sign — from the same date table shown on the page
//      (changes roughly monthly).
//   2. Transiting Moon sign — mean lunar longitude (13.176 deg/day) minus the
//      Lahiri ayanamsa, i.e. the classical sidereal moon sign that drives a
//      panchang (changes every ~2.25 days).
//
// Each is reduced to its gochar house position counted from the user's rashi
// (sign-to-sign distance, 1..12), and the config's per-house effect tables —
// the "written once with an astrologer" lookup — turn those positions into
// effect tags plus a deterministic per-domain status. The LLM receives all of
// it as transit_facts and must not add to it.
import { dayNoon } from './day.js';

export const DOMAINS = ['love', 'career', 'money', 'health', 'travel'];

// Days since J2000.0 (2000-01-01T12:00Z) — standard astronomy epoch.
function daysSinceJ2000(date) {
  return (date.getTime() - Date.parse('2000-01-01T12:00:00Z')) / 86_400_000;
}

// Sidereal moon sign index 0..11 (Aries..Pisces) for an instant.
// Mean longitude is within a couple of degrees of the true moon — plenty for
// a daily sign that changes every ~2.25 days. AYANAMSA approximates Lahiri
// for the mid-2020s (config-tunable, drifts ~50"/year).
const AYANAMSA_DEG = Number(process.env.AYANAMSA_DEG ?? 24.2);

export function moonSignIndex(date) {
  const d = daysSinceJ2000(date);
  const tropical = (218.3164477 + 13.17639648 * d) % 360;
  const sidereal = (((tropical - AYANAMSA_DEG) % 360) + 360) % 360;
  return Math.floor(sidereal / 30);
}

// Transiting Sun sign index from the config's own DOB date table — the same
// table the page displays, so what the user reads always matches the facts
// the reading was phrased from.
export function sunSignIndex(cfg, dayKey) {
  const [, m, d] = dayKey.split('-').map(Number);
  const md = m * 100 + d;
  for (let i = 0; i < cfg.rashis.length; i++) {
    const { start, end } = cfg.rashis[i].sunSpan; // MMDD ints
    const inSpan = start <= end ? md >= start && md <= end : md >= start || md <= end;
    if (inSpan) return i;
  }
  throw new Error(`transit: no sun span covers ${dayKey}`);
}

// Gochar house: position of a transiting sign counted from the user's rashi,
// 1..12 (rashi itself = 1).
export function houseFrom(rashiIndex, transitIndex) {
  return ((transitIndex - rashiIndex + 12) % 12) + 1;
}

// Deterministic per-domain status from the two house-effect vectors.
// Guardrail: never all five weak (the net-livable-day rule) — if the tables
// ever combine that darkly, the least-bad domain is lifted to neutral.
function domainStatuses(sunEffect, moonEffect) {
  const scores = {};
  for (const domain of DOMAINS) {
    scores[domain] = (sunEffect.domains[domain] || 0) + (moonEffect.domains[domain] || 0);
  }
  const status = {};
  for (const domain of DOMAINS) {
    status[domain] = scores[domain] > 0 ? 'strong' : scores[domain] < 0 ? 'weak' : 'neutral';
  }
  if (DOMAINS.every((d) => status[d] === 'weak')) {
    const best = DOMAINS.reduce((a, b) => (scores[b] > scores[a] ? b : a));
    status[best] = 'neutral';
  }
  return status;
}

// The full transit_facts object for one rashi on one product day — the only
// source of astrological truth the generation prompt receives.
export function transitFacts(cfg, dayKey, rashiKey) {
  const rashiIndex = cfg.rashis.findIndex((r) => r.key === rashiKey);
  if (rashiIndex < 0) throw new Error(`transit: unknown rashi "${rashiKey}"`);

  const sunIdx = sunSignIndex(cfg, dayKey);
  const moonIdx = moonSignIndex(dayNoon(dayKey));
  const sunHouse = houseFrom(rashiIndex, sunIdx);
  const moonHouse = houseFrom(rashiIndex, moonIdx);
  const sunEffect = cfg.transits.sunHouse[String(sunHouse)];
  const moonEffect = cfg.transits.moonHouse[String(moonHouse)];

  return {
    date: dayKey,
    rashi: rashiKey,
    rashi_name: cfg.rashis[rashiIndex].name,
    sun_sign: cfg.rashis[sunIdx].name,
    sun_house_from_rashi: sunHouse,
    sun_effects: sunEffect.themes,
    moon_sign: cfg.rashis[moonIdx].name,
    moon_house_from_rashi: moonHouse,
    moon_effects: moonEffect.themes,
    domain_status: domainStatuses(sunEffect, moonEffect),
  };
}
