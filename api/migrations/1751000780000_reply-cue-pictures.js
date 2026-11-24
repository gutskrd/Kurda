/**
 * A reply item's cue names what is being pointed at ("a bowl of milk"); where Hevalo has a drawing of it, the apps now
 * draw it in the cue's place. The road's files carry the picture already, but a published lesson never follows its file
 * again, so this adds it to the published road exercises whose cue names one.
 *
 * Only the new `picture` key is added: the line, the options, their order and the answer stay as they were, so a lesson
 * already open checks the same way. Published exercises are guarded against edits; the guard is lifted for this one
 * update, inside the migration's transaction, as in 1751000770000.
 */

/** Each cue with a drawing, and the word picture that shows it (shared/src/art/word-pictures.ts). */
const PICTURES = {
  'a glass of tea': 'tea',
  'a bowl of milk': 'milk',
  'he points at the door': 'door',
  'he holds up an apple': 'apple',
  'he points at the bread': 'bread',
};

export const up = async (pgm) => {
  await pgm.db.query('ALTER TABLE exercises DISABLE TRIGGER exercises_no_published_rewrite');
  for (const [cue, picture] of Object.entries(PICTURES)) {
    await pgm.db.query(
      `UPDATE exercises e SET payload = e.payload || jsonb_build_object('picture', $2::text)
        WHERE e.type = 'multiple_choice'
          AND e.payload->>'ask' = 'reply'
          AND e.payload->>'cue' = $1
          AND NOT e.payload ? 'picture'
          AND e.lesson_id IN (
            SELECT l.id FROM lessons l
              JOIN skills s ON s.id = l.skill_id
              JOIN units u ON u.id = s.unit_id
              JOIN courses c ON c.id = u.course_id
             WHERE c.slug = 'kurmanji-road')`,
      [cue, picture],
    );
  }
  await pgm.db.query('ALTER TABLE exercises ENABLE TRIGGER exercises_no_published_rewrite');
};

// A picture beside a cue changes no answer, so there is nothing to put back.
export const down = () => {};
