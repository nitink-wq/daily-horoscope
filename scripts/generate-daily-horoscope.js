// Manual/CI entry point for the nightly batch — the same publish path the
// server runs on its own tick, exposed as a CLI for cron jobs, backfills and
// content re-rolls.
//
//   node scripts/generate-daily-horoscope.js                  # today, all rashis
//   node scripts/generate-daily-horoscope.js --day 2026-08-01 # a specific day
//   node scripts/generate-daily-horoscope.js --rashi leo      # one rashi only
//   node scripts/generate-daily-horoscope.js --force          # replace existing rows
import { loadConfig } from '../src/config.js';
import { todayKey } from '../src/day.js';
import { publishAll, publishHoroscope } from '../src/pool.js';
import { closePool } from '../src/db.js';

const args = process.argv.slice(2);
function flagValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const cfg = loadConfig();
const day = flagValue('--day') || todayKey();
const rashi = flagValue('--rashi');
const force = args.includes('--force');

if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error(`--day must be YYYY-MM-DD, got "${day}"`);
  process.exit(1);
}
if (rashi && !cfg.rashis.some((r) => r.key === rashi)) {
  console.error(`--rashi must be one of: ${cfg.rashis.map((r) => r.key).join(', ')}`);
  process.exit(1);
}

try {
  if (rashi) await publishHoroscope(cfg, day, rashi, { force });
  else await publishAll(cfg, day, { force });
  console.log(`[generate] done for ${day}${rashi ? `/${rashi}` : ' (all rashis)'}`);
} catch (err) {
  console.error('[generate] failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
