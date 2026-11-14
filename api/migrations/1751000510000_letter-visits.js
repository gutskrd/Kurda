/**
 * Birds called to somebody's window.
 *
 * A bird out with its letter waits over the country until somebody calls it
 * (letters/service.ts). A call is a row here: whose window the bird came to,
 * when, and how the visit ended — answered (the bird carried the answer home
 * and the two became pen pals), sent on (it flew back out for somebody else),
 * flown on (nobody answered it in time), recalled (its writer called it home)
 * or closed (a block came between them, or the letter was reported). A visit
 * still going has no end yet.
 *
 * A bird visits one window at a time, a window has one visiting bird at a
 * time, and a bird never comes to the same window twice: those are the three
 * indexes. The calls of the last day are counted from here as well.
 */
export const up = (pgm) => {
  pgm.createTable('letter_visits', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    letter_id: { type: 'uuid', notNull: true, references: 'letters', onDelete: 'CASCADE' },
    visitor_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    called_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    ended_at: { type: 'timestamptz' },
    outcome: { type: 'text', check: "outcome IN ('answered','sent_on','flew_on','recalled','closed')" },
    thread_id: { type: 'uuid', references: 'letter_threads', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('letter_visits', 'letter_visits_ended_shape', { check: '(ended_at IS NULL) = (outcome IS NULL)' });
  pgm.createIndex('letter_visits', ['letter_id', 'visitor_id'], { name: 'letter_visits_once', unique: true });
  pgm.createIndex('letter_visits', 'letter_id', { name: 'letter_visits_one_window', unique: true, where: 'ended_at IS NULL' });
  pgm.createIndex('letter_visits', 'visitor_id', { name: 'letter_visits_one_bird', unique: true, where: 'ended_at IS NULL' });
  pgm.createIndex('letter_visits', ['visitor_id', 'called_at'], { name: 'letter_visits_day' });
};

export const down = (pgm) => {
  pgm.dropTable('letter_visits');
};
