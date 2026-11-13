/**
 * Letters by bird: pen pals who write to each other in Kurdish.
 *
 * `letter_threads` is a correspondence between two people, stored once per
 * pair with the lower id first (as dm_messages are). A pair has at most one
 * open correspondence; saying goodbye, or a block, closes it (`ended_at`), and
 * a closed one stays for the reports that may point into it.
 *
 * `letters` holds every letter. A letter sent to somebody new starts with no
 * recipient and no correspondence: that is the writer's bird out looking
 * (`status` 'flying'). The next person in the same age band to send a bird
 * out meets it: in one transaction their letter and this one are each
 * delivered to the other and a correspondence is opened. A partial unique
 * index keeps one bird out per person. The writer's age band at the time of
 * writing is kept on the letter, so the pool is searched within a band by an
 * index rather than by working out every waiting writer's age; the band is
 * checked again against both birth months when the two meet.
 *
 * Reports can now point at a letter (`reports.target_type` 'letter'), so the
 * report check constraint is widened.
 */

const TARGETS_BEFORE = ['user', 'dm_message', 'group_message', 'group', 'library_post', 'library_comment', 'image_post', 'image_comment', 'game_player'];
const TARGETS_AFTER = [...TARGETS_BEFORE, 'letter'];
const list = (values) => values.map((v) => `'${v}'`).join(',');

export const up = (pgm) => {
  pgm.createTable('letter_threads', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_lo: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    user_hi: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_letter_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    ended_at: { type: 'timestamptz' },
    ended_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('letter_threads', 'letter_threads_pair_order', { check: 'user_lo < user_hi' });
  pgm.createIndex('letter_threads', ['user_lo', 'user_hi'], { name: 'letter_threads_pair_open', unique: true, where: 'ended_at IS NULL' });
  pgm.createIndex('letter_threads', ['user_lo', 'user_hi'], { name: 'letter_threads_pair' });
  pgm.createIndex('letter_threads', 'user_hi', { name: 'letter_threads_hi' });

  pgm.createTable('letters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sender_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    recipient_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    thread_id: { type: 'uuid', references: 'letter_threads', onDelete: 'CASCADE' },
    body: { type: 'text', notNull: true, check: 'char_length(body) BETWEEN 1 AND 1500' },
    age_band: { type: 'text', notNull: true, check: "age_band IN ('13-15','16-17','18+')" },
    status: { type: 'text', notNull: true, default: 'flying', check: "status IN ('flying','delivered','recalled','removed')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    delivered_at: { type: 'timestamptz' },
    read_at: { type: 'timestamptz' },
  });
  // a bird out is a letter with nobody to read it yet; a delivered one has both ends
  pgm.addConstraint('letters', 'letters_flying_shape', {
    check: "(status = 'flying') = (recipient_id IS NULL) OR status IN ('recalled','removed')",
  });
  pgm.createIndex('letters', 'sender_id', { name: 'letters_one_bird_out', unique: true, where: "status = 'flying'" });
  pgm.createIndex('letters', ['age_band', 'created_at'], { name: 'letters_pool', where: "status = 'flying'" });
  pgm.createIndex('letters', ['thread_id', 'created_at'], { name: 'letters_thread' });
  pgm.createIndex('letters', ['sender_id', 'created_at'], { name: 'letters_sender_day' });
  pgm.createIndex('letters', 'recipient_id', { name: 'letters_unread', where: "status = 'delivered' AND read_at IS NULL" });

  pgm.dropConstraint('reports', 'reports_target_type_check');
  pgm.addConstraint('reports', 'reports_target_type_check', { check: `target_type IN (${list(TARGETS_AFTER)})` });
};

export const down = (pgm) => {
  pgm.sql(`DELETE FROM reports WHERE target_type = 'letter'`);
  pgm.dropConstraint('reports', 'reports_target_type_check');
  pgm.addConstraint('reports', 'reports_target_type_check', { check: `target_type IN (${list(TARGETS_BEFORE)})` });
  pgm.dropTable('letters');
  pgm.dropTable('letter_threads');
};
