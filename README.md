# Daily Horoscope (E1)

AstroLokal's Daily Horoscope page. The fourth and final arm of the feed-banner
retention experiment (E2 Bhagya Score, E3 Lucky Rashi Dice, E4 Fortune Card are
live). A webview opened from a feed-banner tap, deep-linked with a `rashi`
query param, showing a per-rashi daily reading refreshed nightly.

## Stack

- Node 24 (current LTS), Express 5, ES modules
- Any Postgres-compliant database via a generic `pg` client (`DATABASE_URL`
  only, no vendor APIs) — RDS, Cloud SQL, Supabase, Neon, vanilla postgres
- `node-pg-migrate` for migrations (the standard tool for node-postgres)
- Google Gemini (REST, no SDK) for nightly content phrasing — optional
- Single static HTML client, self-hosted fonts, no front-end build step

## Run locally

```bash
docker compose up --build
# open http://localhost:3000/?rashi=leo&user_id=test-user-1
```

The compose stack mirrors production: postgres -> one-shot migrate job -> app.
Without `GEMINI_API_KEY` the app publishes the config's sample readings, so
the page is fully browsable offline. Set the key in `docker-compose.yml` to
exercise the real generation pipeline.

URL params: `rashi` (defaults to config `defaultRashi`), `user_id` (optional,
stored on engagement events).

## How the nightly content works

Gemini **phrases** the day's astrology, it never **invents** it (Tier A of the
spec):

1. `src/transit.js` computes two real inputs per day: the transiting Sun sign
   (from the same date table the page displays) and the sidereal Moon sign
   (mean lunar longitude minus ayanamsa — the classical panchang moon, changes
   every ~2.25 days).
2. Each is reduced to its gochar house position (1..12) from the user's rashi;
   the per-house effect tables in `config/experiment.config.json`
   (`transits.sunHouse` / `transits.moonHouse`) turn positions into effect
   tags and deterministic per-domain strong/neutral/weak statuses.
3. Those `transit_facts` are the only astrological truth the Gemini prompt
   receives. It must copy the domain statuses verbatim.
4. The pipeline validates hard (`src/config.js`): mood/colour/status enums,
   380-450 char reading, 4-6 sentences, 60-char insight lines, banned-word and
   fear-language lint, no em dashes, never all five domains weak, and a
   near-duplicate check against the same rashi's last 3 readings.
5. On failure it regenerates once, then falls back to yesterday's row, then to
   the config sample. Publishing never fails; stale beats broken.

Generation happens inside the web pods (no CronJob dependency): today's batch
is ensured at boot and on demand per request, and tomorrow's batch is
pre-generated in the night window before the 06:00 IST cutover
(`HOROSCOPE_PREGEN_HOURS`, default 4). Advisory locks make any number of pods
safe. A manual CLI exists for backfills and re-rolls:

```bash
npm run horoscope:generate -- --day 2026-08-01 --rashi leo --force
```

## Database and migrations

Every schema change is a new migration file:

```bash
npm run migrate:create -- my-change-name   # generate
npm run migrate:up                          # apply
```

Applied migrations are recorded in the `pgmigrations` table, so the deploy
job runs each migration exactly once per database no matter how many times it
executes. Tables: `horoscopes` (one row per day+rashi, with the transit facts
kept as an audit trail) and `events` (engagement, each row carrying
`content_version` — the date key of the copy batch the user actually saw).

## Deploy (Kubernetes)

```bash
kubectl create configmap daily-horoscope-config \
  --from-file=experiment.config.json=config/experiment.config.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/daily-horoscope-migrate --timeout=120s
kubectl apply -f k8s/deployment.yaml
```

Pods are stateless; scale `replicas` freely. Secrets: `DATABASE_URL`, `PGSSL`
(set `require` for managed providers), `GEMINI_API_KEY` (optional; omit to
serve config samples). The experiment config is a ConfigMap so copy changes
are a config rollout, not an image rebuild.

## Navigation behaviour (product decision)

The back button returns the user where they came from (`history.back()`, else
`nav.backDeeplink`). The single closing CTA ("Talk to an Astrologer") performs
the **same back action** — the app shell owns astrologer routing;
`consultTarget.deeplink` is only its no-history fallback.

## Events

`POST /api/event` with `page_view` (once per open), `rashi_switch`,
`insights_expand`, `cta_tap`. Every event carries `content_version` so
engagement can be cut by copy batch.

## Decisions on the spec's open items

1. **Language**: plain simple English (per product direction), Indian-English
   words welcome, em dashes banned in copy — enforced by the validator.
2. **Astrology backing**: Tier A (Sun-sign table + computed Moon sign +
   config gochar tables). Tier B (full ephemeris) can replace
   `src/transit.js` later without touching the pipeline shape.
3. **Logo**: the real AstroLokal mark ships in `public/logo.png`; the 12
   shared rashi illustrations ship in `public/rashi/`.
