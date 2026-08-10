# E1 Daily Horoscope — analytics events

Surface: the Daily Horoscope webview (astro-daily-horoscope.astrolokal.com),
opened from the app's feed banner. All events are stored in the `events`
table of the app's Postgres database, one row per event.

## Events

| Event | Fires when | Notes |
|---|---|---|
| `page_view` | The page finishes its first successful load | Once per page open, NOT again on rashi switches within the same open |
| `rashi_switch` | The user picks a different rashi from the "Change Rashi" sheet | Not fired if they reselect their current rashi |
| `insights_expand` | The user taps "View Detailed Horoscope" (opening it) | Collapsing it again does not fire anything |
| `back_tap` | The user taps the on-page back button (top left) | Hardware/phone back is handled by the app shell and never reaches the page, so it is NOT counted here |
| `cta_tap` | The user taps "Talk to an Astrologer" (inline button or the sticky bottom bar — same event for both) | Fired before the navigation; delivery uses sendBeacon so it survives leaving the page |

## Row schema (`events` table)

| Column | Type | Meaning |
|---|---|---|
| `id` | bigserial | Row id |
| `user_id` | text, nullable | The app user's id, passed to the page as a URL parameter. Null only if the app opened the page without it |
| `rashi` | text | The rashi selected at the moment of the event (aries … pisces) |
| `event` | text | One of the five event names above |
| `content_version` | date | The product day of the copy batch the user saw. Days cut over at 06:00 IST, so an event at 2 AM belongs to the previous calendar date. Use this to compare engagement across content batches |
| `created_at` | timestamptz | Server-side event time (UTC) |

## Funnel

```
page_view  →  rashi_switch (exploration)
           →  insights_expand (depth)
           →  cta_tap (conversion)   /   back_tap (exit via button)
```

## Caveats for analysis

- `page_view` is per page-open, not per user-day: the same user opening the
  banner twice = 2 page views. Dedupe with `COUNT(DISTINCT user_id)`.
- `content_version` (product day, 06:00 IST cutover) is the right "date"
  column for daily cuts; `created_at` is UTC wall-clock.
- Events are fire-and-forget from the client: an event failing to send never
  blocks the page, so counts are a slight undercount on very flaky networks.
- The two CTA placements (inline + sticky bar) are intentionally the same
  event; they cannot be told apart in the data.

## Starter queries

Daily funnel:

```sql
SELECT content_version AS day, event,
       COUNT(*) AS times, COUNT(DISTINCT user_id) AS users
FROM events
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

CTA conversion per day:

```sql
SELECT content_version AS day,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'page_view') AS viewers,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'cta_tap')   AS cta_users,
  ROUND(100.0 * COUNT(DISTINCT user_id) FILTER (WHERE event = 'cta_tap')
        / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event = 'page_view'), 0), 1)
        AS cta_rate_pct
FROM events
GROUP BY 1 ORDER BY 1 DESC;
```

Per-user journey (for spot checks):

```sql
SELECT user_id, event, rashi, content_version, created_at
FROM events
WHERE user_id = '<id>'
ORDER BY created_at;
```
