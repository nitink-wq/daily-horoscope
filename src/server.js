// Thin HTTP layer. Pods are fully stateless — all content lives in Postgres —
// so this scales horizontally in Kubernetes with no coordination.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { healthcheck, closePool, query } from './db.js';
import { todayKey, nextResetAt } from './day.js';
import { ensureRashiForToday, ensureUpcoming, fetchHoroscope, publishAll } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const cfg = loadConfig(); // fail fast at boot on a broken config

app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));

// --- health probes (Kubernetes liveness/readiness) -------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/readyz', async (req, res) => {
  try {
    await healthcheck();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// --- helpers ---------------------------------------------------------------
const RASHI_KEYS = new Set(cfg.rashis.map((r) => r.key));

function rashiParam(req) {
  const raw = String(req.query.rashi || req.body?.rashi || '').toLowerCase();
  return RASHI_KEYS.has(raw) ? raw : cfg.defaultRashi;
}

// user_id is optional on this surface (the page is readable logged-out); when
// present it must look sane before it is stored on events.
function userParam(req) {
  const raw = req.query.user_id ?? req.body?.user_id;
  if (raw == null || raw === '') return null;
  const id = String(raw);
  return /^[\w.:-]{1,64}$/.test(id) ? id : null;
}

// Static payload every response shares: the selector table, palette, copy.
function staticPayload() {
  return {
    rashis: cfg.rashis.map((r) => ({
      key: r.key, name: r.name, hindi: r.hindi, element: r.element,
      dob: r.dob, image: `rashi/${r.image}`,
    })),
    colours: Object.fromEntries(cfg.colours.map((c) => [c.name, c.hex])),
    copy: cfg.copy,
    astrologer: cfg.astrologer,
    nav: cfg.nav,
    consultDeeplink: cfg.consultTarget.deeplink,
  };
}

// --- API -------------------------------------------------------------------
// One endpoint serves both the first load and every selector swap: the spec's
// "re-fetch (date, selected_rashi) from the same table".
app.get('/api/horoscope', async (req, res) => {
  try {
    const rashi = rashiParam(req);
    // Self-healing: if the nightly pass hasn't produced this rashi's row yet
    // (pod restart, first request just after the 06:00 IST cutover), publish
    // it on demand.
    await ensureRashiForToday(cfg, rashi).catch((err) => {
      console.error(`[horoscope] on-demand publish failed: ${err.message}`);
    });
    const day = todayKey();
    const row = await fetchHoroscope(day, rashi);
    if (!row) {
      return res.status(503).json({ error: 'CONTENT_MISSING', copy: cfg.copy.error });
    }
    res.json({
      ...staticPayload(),
      rashi,
      day,
      contentVersion: day, // logged on every event so engagement cuts by copy batch
      serverNow: new Date().toISOString(),
      nextResetAt: nextResetAt().toISOString(),
      horoscope: {
        mood: row.mood,
        luckyNumber: row.lucky_number,
        luckyTime: row.lucky_time,
        luckyColours: row.lucky_colours,
        todayReading: row.today_reading,
        // Older rows predate this column; the client falls back to the
        // static config line when it is null.
        consultQuestion: row.consult_question || null,
        domainInsights: row.domain_insights,
      },
    });
  } catch (err) {
    console.error('[api] unexpected error', err);
    res.status(500).json({ error: 'INTERNAL', copy: cfg.copy.error });
  }
});

// Engagement events (page_view, rashi_switch, insights_expand, cta_tap).
// Fire-and-forget from the client; every row carries content_version (the
// date key) so engagement can later be cut by which day's copy batch it was.
const EVENTS = new Set(['page_view', 'rashi_switch', 'insights_expand', 'cta_tap']);
app.post('/api/event', async (req, res) => {
  try {
    const event = String(req.body?.event || '');
    if (!EVENTS.has(event)) return res.status(400).json({ error: 'BAD_EVENT' });
    const rashi = rashiParam(req);
    const version = String(req.body?.content_version || todayKey());
    await query(
      `INSERT INTO events (user_id, rashi, event, content_version)
       VALUES ($1, $2, $3, $4::date)`,
      [userParam(req), rashi, event, /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : todayKey()],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] event insert failed', err.message);
    res.json({ ok: false }); // analytics must never break the page
  }
});

// --- boot / graceful shutdown ---------------------------------------------
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`[daily-horoscope] listening on :${port}`);
});

// Built-in nightly generation (no CronJob dependency): publish today's batch
// at boot, then every 5 minutes (a) make sure today's rows exist and (b) in
// the night window before the 06:00 IST cutover, pre-generate tomorrow's
// batch via Gemini so the cutover flips onto ready content. Both checks are
// cheap once done, and multi-pod safe via advisory locks.
function horoscopeTick() {
  publishAll(cfg, todayKey()).catch((err) => {
    console.error('[horoscope] daily publish failed:', err.message);
  });
  ensureUpcoming(cfg).catch((err) => {
    console.error('[horoscope] nightly pre-generation failed:', err.message);
  });
}
horoscopeTick();
setInterval(horoscopeTick, 5 * 60 * 1000).unref();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[daily-horoscope] ${signal} received, shutting down`);
    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });
    // Hard exit if connections refuse to drain (k8s will SIGKILL anyway).
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
