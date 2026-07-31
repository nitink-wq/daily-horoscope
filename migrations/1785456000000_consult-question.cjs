/**
 * Adds the daily consult question: a short curious question, generated
 * nightly alongside the reading, shown in the astrologer nudge bubble.
 * Nullable — rows published before this change fall back to the static
 * config line on the client.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('horoscopes', {
    consult_question: { type: 'text' }, // 30-90 chars, ends with "?", validated app-side
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('horoscopes', 'consult_question');
};
