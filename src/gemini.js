// Daily horoscope phrasing via Google Gemini (REST, no SDK).
//
// Gemini's job is to PHRASE a day's astrology, never to invent it: the
// transit facts computed in transit.js are its only source of astrological
// truth, and the domain statuses arrive pre-decided for it to copy. Entirely
// optional: when GEMINI_API_KEY is unset, or the call fails, or the output
// fails validation twice, the pool falls back (yesterday's row, then the
// config sample) — stale beats broken; a scary reading is an incident.
import { validateHoroscope, isNearDuplicate } from './config.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = 90_000;

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const SCHEMA_EXAMPLE = `{
  "mood": "Reflective",
  "lucky_number": 29,
  "lucky_time": "12:00 PM",
  "lucky_colours": ["Purple", "Blue", "Red"],
  "today_reading": "2-4 sentences, 180-300 characters, addresses the user by rashi name",
  "consult_question": "one short curious question, 30-90 chars, ends with ?",
  "domain_insights": [
    { "domain": "love",   "status": "copy from domain_status", "line": "2 short sentences, 70-130 chars" },
    { "domain": "career", "status": "copy from domain_status", "line": "2 short sentences, 70-130 chars" },
    { "domain": "money",  "status": "copy from domain_status", "line": "2 short sentences, 70-130 chars" },
    { "domain": "health", "status": "copy from domain_status", "line": "2 short sentences, 70-130 chars" },
    { "domain": "travel", "status": "copy from domain_status", "line": "2 short sentences, 70-130 chars" }
  ]
}`;

function buildPrompt(cfg, facts, recentReadings, avoid) {
  return `SYSTEM:
You write the daily horoscope reading for AstroLokal, an astrology app for
tier-2/3 Indian users. You are given real transit facts for today. You do not
decide what the astrology is, you only phrase it. Output strict JSON only,
matching the given schema. No markdown, no preamble.

AUDIENCE: readers in tier-2/3 Indian cities. The power users are women and
Gen-Z men. Write like the daily rashifal they already know and trust from
the newspaper or a family astrologer: direct, warm, about THEIR day (work,
home, money, heart, health), never abstract cosmic talk.

REGISTER: Simple everyday English, class-8 reading level, warm and grounded,
never like a fortune cookie. Short words, short sentences, no idioms that
need a dictionary. Familiar Indian words used in Indian English are welcome
(pandit ji, puja). Never use an em dash or an en dash anywhere.

HARD RULES:
- Every claim in today_reading and domain_insights must trace back to the
  transit facts you are given below. Do not introduce planets, houses, or
  effects that are not in the input. At most one planet name may appear in
  the whole output.
- BANNED words and themes: death, illness, accident, legal outcomes, divorce,
  pregnancy; naming specific people in the user's life; absolutes ("zaroor",
  "pakka", "100%", "definitely will").
- BANNED fear framing: "beware", "danger", "warning", "loss". A "weak" domain
  reads as low-key, not ominous. Frame it gently ("a slow day for this, keep
  it light"), never as a threat.
- Copy each domain status EXACTLY from domain_status in the facts. Do not
  change any status.
- mood must be chosen from exactly this list: ${cfg.moods.join(', ')}
- lucky_colours must be exactly 3 distinct values from exactly this list: ${cfg.colours.map((c) => c.name).join(', ')}
- lucky_time is one clock time like "11:30 AM", not a range.
- today_reading: 2-4 sentences, 180-300 characters, addresses the user by
  rashi name ("Today, dear ${facts.rashi_name}, ..."). Short and complete,
  like a real newspaper rashifal a reader finishes in one glance.
- consult_question: ONE short question, 30-90 characters, ending with a
  question mark. It ties to today's reading but stays generic enough for
  anyone of this rashi: it teases what the day is hinting at (who, which,
  when, what) so the reader wants to ask an astrologer. Never mention
  kundli, charts, or astrology terms. Never ask about banned themes.
  Example shapes: "Want to know which hour of today is truly yours?",
  "Curious who is quietly thinking of you today?".
- domain_insights lines: 70 to 130 characters each, exactly two short
  sentences, in this fixed order: love, career, money, health, travel.
  Sentence 1 states today's picture for that domain, drawn from the transit
  facts. Sentence 2 gives one concrete, specific hook that makes the user
  curious: a time of day, a small action, a person type ("someone senior",
  "someone at home"), or a question the day will answer. Never vague filler
  like "stay positive". It should feel like the line knows something more.

USER:
Today's date: ${facts.date}
Rashi: ${facts.rashi_name}
Transit facts for this rashi today (this is your only source of astrological
truth. Phrase these, do not add to them):
${JSON.stringify(facts, null, 2)}

Last ${recentReadings.length || 0} days of today_reading for this rashi (do not repeat phrasing or theme):
${recentReadings.length ? recentReadings.map((r) => `- ${r}`).join('\n') : '(none)'}
${avoid ? `\nYesterday's lucky picks (choose differently today): ${avoid}` : ''}

Return one JSON object matching this schema: ${SCHEMA_EXAMPLE}
Nothing else.`;
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return JSON.parse(text);
}

// Generate + validate, with one in-place retry (spec: "on any failure,
// regenerate once"); the caller decides the fallback after that.
export async function generateWithGemini(cfg, facts, recentReadings, avoid) {
  const prompt = buildPrompt(cfg, facts, recentReadings, avoid);
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await callGemini(prompt);
      const clean = validateHoroscope(parsed, cfg, `gemini ${facts.rashi} attempt ${attempt}`, { facts });
      if (isNearDuplicate(clean.today_reading, recentReadings)) {
        throw new Error('near-duplicate of a recent reading');
      }
      return clean;
    } catch (err) {
      lastErr = err;
      console.error(`[gemini] ${facts.rashi} attempt ${attempt} failed: ${err.message}`);
    }
  }
  throw lastErr;
}
