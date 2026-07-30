/**
 * Initial schema for the Daily Horoscope surface.
 *
 * Managed by node-pg-migrate (the standard migration tool for node-postgres).
 * Applied migrations are recorded in the `pgmigrations` table, so each
 * migration runs exactly once per database no matter how many times the
 * deploy job executes or how many pods are running.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // One row per (product day, rashi): the nightly batch. The 06:00 IST
  // cutover key is the content_version logged on every event.
  pgm.createTable('horoscopes', {
    day: { type: 'date', notNull: true },
    rashi: { type: 'text', notNull: true },
    mood: { type: 'text', notNull: true },              // fixed enum, validated app-side
    lucky_number: { type: 'integer', notNull: true },
    lucky_time: { type: 'text', notNull: true },        // single clock time, "12:00 PM"
    lucky_colours: { type: 'jsonb', notNull: true },    // exactly 3 names from the fixed palette
    today_reading: { type: 'text', notNull: true },     // 380-450 chars, 4-6 sentences
    domain_insights: { type: 'jsonb', notNull: true },  // exactly 5, fixed order
    transit_facts: { type: 'jsonb', notNull: true },    // the real inputs Gemini phrased (audit trail)
    source: { type: 'text', notNull: true },            // gemini | fallback-previous | sample
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('horoscopes', 'horoscopes_pkey', {
    primaryKey: ['day', 'rashi'],
  });
  pgm.addConstraint('horoscopes', 'horoscopes_lucky_number_range', {
    check: 'lucky_number BETWEEN 1 AND 99',
  });

  // Engagement events. content_version is the date key of the copy batch the
  // user actually saw, so engagement can later be cut by batch.
  pgm.createTable('events', {
    id: 'bigserial',
    user_id: { type: 'text' }, // nullable: the page is readable logged-out
    rashi: { type: 'text', notNull: true },
    event: { type: 'text', notNull: true }, // page_view | rashi_switch | insights_expand | cta_tap
    content_version: { type: 'date', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('events', ['event', 'created_at']);
  pgm.createIndex('events', ['content_version']);
};

exports.down = (pgm) => {
  pgm.dropTable('events');
  pgm.dropTable('horoscopes');
};
