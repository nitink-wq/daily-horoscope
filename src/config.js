// Loads the experiment config. Every user-visible string (copy, sample
// readings, nudges), every enum (moods, colours, statuses), the rashi fact
// table and the gochar effect tables live here — logic never contains copy,
// so re-contenting or A/B changes never touch code. Validated at boot: fail
// fast, not mid-request.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH =
  process.env.EXPERIMENT_CONFIG_PATH ||
  path.join(__dirname, '..', 'config', 'experiment.config.json');

export const DOMAINS = ['love', 'career', 'money', 'health', 'travel'];
export const STATUSES = ['strong', 'neutral', 'weak'];

// The main reading is short on purpose: 2-4 sentences a tier-2/3 reader
// finishes in one glance, like a real newspaper rashifal.
const READING_MIN = 180;
const READING_MAX = 300;
const READING_SENTENCES_MIN = 2;
const READING_SENTENCES_MAX = 4;
// The consult question: one short curious question shown in the astrologer
// nudge, tied to the day's reading but generic enough for anyone.
const QUESTION_MIN = 30;
const QUESTION_MAX = 90;
// Domain insight lines are two short sentences: the day's state plus one
// concrete hook that makes the reader curious. Long enough to feel personal,
// short enough for a half-width card.
const LINE_MIN = 70;
const LINE_MAX = 130;

// Word-boundary match for plain words; substring match for tokens with
// non-word characters (e.g. "100%").
export function findBannedWord(cfg, text) {
  const lower = text.toLowerCase();
  for (const word of cfg.bannedWords) {
    if (/^[\w]+$/.test(word)) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) return word;
    } else if (lower.includes(word.toLowerCase())) {
      return word;
    }
  }
  return null;
}

function sentenceCount(text) {
  return (text.match(/[.!?](\s|$)/g) || []).length;
}

// Near-duplicate guard: word-set Jaccard similarity against recent readings.
// Freshness is a product requirement — a repeat reader must never see
// yesterday's paragraph wearing today's date.
export function isNearDuplicate(text, recentReadings) {
  const words = (s) => new Set(s.toLowerCase().match(/[a-z]+/g) || []);
  const a = words(text);
  for (const prior of recentReadings) {
    const b = words(prior);
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    const union = a.size + b.size - shared;
    if (union > 0 && shared / union >= 0.75) return true;
  }
  return false;
}

// Validate one day's horoscope for one rashi. Enforced in the pipeline, never
// trusted to the LLM. `opts.facts` pins domain statuses to the computed
// transit facts (Gemini must copy, not choose); sample content in the config
// skips that check because it is day-independent by design.
export function validateHoroscope(h, cfg, label, opts = {}) {
  const fail = (msg) => { throw new Error(`${label}: ${msg}`); };

  if (!cfg.moods.includes(h.mood)) fail(`mood "${h.mood}" not in the mood enum`);

  if (!Number.isInteger(h.lucky_number) || h.lucky_number < 1 || h.lucky_number > 99) {
    fail(`lucky_number must be an integer 1..99, got ${h.lucky_number}`);
  }
  if (typeof h.lucky_time !== 'string' || !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(h.lucky_time)) {
    fail(`lucky_time "${h.lucky_time}" must be a single clock time like "12:00 PM"`);
  }

  const palette = cfg.colours.map((c) => c.name);
  if (!Array.isArray(h.lucky_colours) || h.lucky_colours.length !== 3 ||
      new Set(h.lucky_colours).size !== 3 ||
      h.lucky_colours.some((c) => !palette.includes(c))) {
    fail('lucky_colours must be exactly 3 distinct names from the fixed palette');
  }

  if (typeof h.today_reading !== 'string') fail('today_reading required');
  const reading = h.today_reading.trim();
  if (reading.length < READING_MIN || reading.length > READING_MAX) {
    fail(`today_reading must be ${READING_MIN}-${READING_MAX} chars, got ${reading.length}`);
  }
  const sentences = sentenceCount(reading);
  if (sentences < READING_SENTENCES_MIN || sentences > READING_SENTENCES_MAX) {
    fail(`today_reading must be ${READING_SENTENCES_MIN}-${READING_SENTENCES_MAX} sentences, got ${sentences}`);
  }

  if (typeof h.consult_question !== 'string') fail('consult_question required');
  const question = h.consult_question.trim();
  if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
    fail(`consult_question must be ${QUESTION_MIN}-${QUESTION_MAX} chars, got ${question.length}`);
  }
  if (!question.endsWith('?')) fail('consult_question must end with a question mark');
  if (/kundli|kundali|janampatri/i.test(question)) {
    fail('consult_question must not mention the kundli — keep it simple and curious');
  }

  if (!Array.isArray(h.domain_insights) || h.domain_insights.length !== DOMAINS.length) {
    fail(`domain_insights must hold exactly ${DOMAINS.length} entries`);
  }
  h.domain_insights.forEach((ins, i) => {
    if (ins.domain !== DOMAINS[i]) fail(`domain_insights[${i}] must be "${DOMAINS[i]}", got "${ins.domain}"`);
    if (!STATUSES.includes(ins.status)) fail(`domain_insights[${i}] status "${ins.status}" invalid`);
    if (opts.facts && ins.status !== opts.facts.domain_status[ins.domain]) {
      fail(`domain_insights[${i}] status "${ins.status}" does not match the computed transit status "${opts.facts.domain_status[ins.domain]}"`);
    }
    if (typeof ins.line !== 'string' || !ins.line.trim()) fail(`domain_insights[${i}] line required`);
    const line = ins.line.trim();
    if (line.length < LINE_MIN || line.length > LINE_MAX) {
      fail(`domain_insights[${i}] line must be ${LINE_MIN}-${LINE_MAX} chars, got ${line.length}`);
    }
  });
  if (h.domain_insights.every((ins) => ins.status === 'weak')) {
    fail('all 5 domains weak — breaks the net-livable-day rule');
  }

  // Valence + register lint over every user-visible string. Em/en dashes are
  // banned by the brand voice ("simple English, no em dashes").
  const text = [reading, question, ...h.domain_insights.map((i) => i.line)].join(' ');
  if (/[—–]/.test(text)) fail('em/en dash in copy — banned by the register');
  const hit = findBannedWord(cfg, text);
  if (hit) fail(`banned word "${hit}" in copy`);

  return {
    mood: h.mood,
    lucky_number: h.lucky_number,
    lucky_time: h.lucky_time,
    lucky_colours: h.lucky_colours,
    today_reading: reading,
    consult_question: question,
    domain_insights: h.domain_insights.map((i) => ({
      domain: i.domain, status: i.status, line: i.line.trim(),
    })),
  };
}

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  // --- rashi fact table: 12 static rows, DOB order Aries..Pisces -----------
  if (!Array.isArray(raw.rashis) || raw.rashis.length !== 12) {
    throw new Error('config: rashis must list exactly 12 signs in DOB order');
  }
  const seen = new Set();
  for (const r of raw.rashis) {
    for (const field of ['key', 'name', 'hindi', 'element', 'dob', 'image']) {
      if (typeof r[field] !== 'string' || !r[field]) {
        throw new Error(`config: rashis entry missing "${field}" (${JSON.stringify(r)})`);
      }
    }
    if (!r.sunSpan || !Number.isInteger(r.sunSpan.start) || !Number.isInteger(r.sunSpan.end)) {
      throw new Error(`config: rashis "${r.key}" needs sunSpan {start, end} as MMDD ints`);
    }
    if (seen.has(r.key)) throw new Error(`config: duplicate rashi key "${r.key}"`);
    seen.add(r.key);
  }

  // --- enums ---------------------------------------------------------------
  if (!Array.isArray(raw.moods) || raw.moods.length < 10) {
    throw new Error('config: moods enum must hold at least 10 words');
  }
  if (!Array.isArray(raw.colours) || raw.colours.length < 8 ||
      raw.colours.some((c) => !c.name || !/^#[0-9A-Fa-f]{6}$/.test(c.hex || ''))) {
    throw new Error('config: colours must map at least 8 names to approved hex values');
  }

  // --- gochar effect tables: houses 1..12 for sun and moon -----------------
  for (const table of ['sunHouse', 'moonHouse']) {
    const t = raw.transits?.[table];
    for (let house = 1; house <= 12; house++) {
      const e = t?.[String(house)];
      if (!e || !Array.isArray(e.themes) || e.themes.length === 0 || typeof e.domains !== 'object') {
        throw new Error(`config: transits.${table}["${house}"] needs themes[] and domains{}`);
      }
      for (const [domain, v] of Object.entries(e.domains)) {
        if (!DOMAINS.includes(domain) || ![-1, 0, 1].includes(v)) {
          throw new Error(`config: transits.${table}["${house}"] bad domain weight ${domain}=${v}`);
        }
      }
    }
  }

  if (!Array.isArray(raw.bannedWords)) throw new Error('config: bannedWords must be an array');
  if (!raw.consultTarget?.deeplink) throw new Error('config: consultTarget.deeplink required');
  if (!raw.copy) throw new Error('config: copy block required');
  raw.astrologer = raw.astrologer || { name: null, avatarUrl: null };
  raw.nav = raw.nav || { backDeeplink: null };
  raw.defaultRashi = raw.defaultRashi || raw.rashis[0].key;
  if (!seen.has(raw.defaultRashi)) throw new Error(`config: defaultRashi "${raw.defaultRashi}" unknown`);

  // --- sample fallback: one valid horoscope per rashi ----------------------
  // Served only when Gemini is unavailable AND there is no previous day to
  // re-serve, so a fresh install still renders a full page.
  if (!raw.sampleHoroscopes || typeof raw.sampleHoroscopes !== 'object') {
    throw new Error('config: sampleHoroscopes must map every rashi key to a sample');
  }
  for (const r of raw.rashis) {
    const sample = raw.sampleHoroscopes[r.key];
    if (!sample) throw new Error(`config: sampleHoroscopes missing "${r.key}"`);
    validateHoroscope(sample, raw, `config sampleHoroscopes.${r.key}`);
  }

  cached = raw;
  return cached;
}
