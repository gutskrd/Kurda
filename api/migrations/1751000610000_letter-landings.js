/**
 * Every letter lands at the window once (letters/service.ts).
 *
 * A letter's landing is kept apart from its reading. `read_at` is set when
 * the correspondence is opened; a notification, the widget and the pen pal
 * list all open it straight away, so a bird keyed on `read_at` was used up
 * before the window ever showed it. `letters.landed_at` is set when the
 * window has shown the bird land (POST /letters/landed), and a letter is
 * listed for the window while either is still missing: it lands once, then
 * waits on the sill until it is read. Letters read before this count as
 * landed, so nothing old flies in when it goes live.
 *
 * `letter_visits.answer_id` is the answer a bird carried home from a window:
 * the letter that lands as its writer's homecoming. It is filled in for the
 * visits answered before this: the visitor's first letter in the
 * correspondence the visit opened, which is what the window used to look for.
 *
 * A bird that comes home by itself (nobody answered it in time, its writer
 * moved into another age band, or their pen pal places filled up) says so at
 * the window once: `recalled_at` and `recalled_why` are when and why, and its
 * `landed_at` stays empty until the window has shown it. A bird its writer
 * called back is landed at once, since they watched it come. Birds home
 * before this are all landed.
 *
 * `letters.idempotency_key` is the key a letter was sent with, one per writer,
 * so a send repeated after its answer was lost (a dropped connection, a phone
 * put away) comes back as the letter already sent instead of a refusal.
 *
 * `notification_prefs.letters` is letters' own notification setting. NULL is
 * "as my people setting (`friends`) is", which is what letters were sent
 * under before they had one, so turning those off kept letters off too.
 */
export const up = (pgm) => {
  pgm.addColumns('letters', {
    landed_at: { type: 'timestamptz' },
    recalled_at: { type: 'timestamptz' },
    recalled_why: { type: 'text', check: "recalled_why IN ('called_back','unanswered','band','full')" },
    idempotency_key: { type: 'text', check: 'char_length(idempotency_key) BETWEEN 1 AND 100' },
  });
  pgm.addColumns('letter_visits', {
    answer_id: { type: 'uuid', references: 'letters', onDelete: 'SET NULL' },
  });
  pgm.addColumns('notification_prefs', {
    letters: { type: 'boolean' },
  });

  pgm.sql(`UPDATE letters SET landed_at = read_at WHERE read_at IS NOT NULL`);
  pgm.sql(`UPDATE letters SET landed_at = now() WHERE status = 'recalled' AND landed_at IS NULL`);
  pgm.sql(`
    UPDATE letter_visits v SET answer_id = (
      SELECT l.id FROM letters l
       WHERE l.thread_id = v.thread_id AND l.sender_id = v.visitor_id AND l.status IN ('delivered','removed')
       ORDER BY l.delivered_at, l.id
       LIMIT 1)
     WHERE v.outcome = 'answered' AND v.thread_id IS NOT NULL`);

  pgm.createIndex('letters', 'recipient_id', { name: 'letters_to_land', where: "status = 'delivered' AND landed_at IS NULL" });
  pgm.createIndex('letters', ['sender_id', 'idempotency_key'], { name: 'letters_idempotency', unique: true, where: 'idempotency_key IS NOT NULL' });
  pgm.createIndex('letter_visits', 'answer_id', { name: 'letter_visits_answer', where: 'answer_id IS NOT NULL' });
};

export const down = (pgm) => {
  pgm.dropIndex('letter_visits', 'answer_id', { name: 'letter_visits_answer' });
  pgm.dropIndex('letters', ['sender_id', 'idempotency_key'], { name: 'letters_idempotency' });
  pgm.dropIndex('letters', 'recipient_id', { name: 'letters_to_land' });
  pgm.dropColumns('notification_prefs', ['letters']);
  pgm.dropColumns('letter_visits', ['answer_id']);
  pgm.dropColumns('letters', ['landed_at', 'recalled_at', 'recalled_why', 'idempotency_key']);
};
