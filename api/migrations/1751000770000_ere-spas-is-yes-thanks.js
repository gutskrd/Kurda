/**
 * "Erê, spas" means "Yes, thanks", not "Yes, please". The road's files say so already, but a published lesson never
 * follows its file again, so the lessons learners see, and the game sentences drawn from their conversations, still
 * carry the old meaning. This puts "Yes, thanks" in them, in every road exercise and every game sentence that says
 * "Yes, please".
 *
 * Published exercises are guarded against edits so a lesson never changes under someone partway through it; the fix
 * is made in place rather than as a new version so that progress and recordings stay with the lessons they belong to.
 * Only English wording changes: every Kurdish line, answer key and option's place stays as it was, so a lesson already
 * open still checks the same way. The guard is lifted for this one update, inside the migration's transaction.
 */

const FROM = 'Yes, please';
const TO = 'Yes, thanks';

export const up = async (pgm) => {
  await pgm.db.query('ALTER TABLE exercises DISABLE TRIGGER exercises_no_published_rewrite');
  // The phrase is plain text inside JSON strings, so it can be swapped in the serialised payload safely.
  await pgm.db.query(
    `UPDATE exercises e SET payload = replace(e.payload::text, $1, $2)::jsonb
      WHERE e.payload::text LIKE '%' || $1 || '%'
        AND e.lesson_id IN (
          SELECT l.id FROM lessons l
            JOIN skills s ON s.id = l.skill_id
            JOIN units u ON u.id = s.unit_id
            JOIN courses c ON c.id = u.course_id
           WHERE c.slug = 'kurmanji-road')`,
    [FROM, TO],
  );
  await pgm.db.query('ALTER TABLE exercises ENABLE TRIGGER exercises_no_published_rewrite');
  await pgm.db.query(
    `UPDATE game_content SET payload = replace(payload::text, $1, $2)::jsonb
      WHERE payload::text LIKE '%' || $1 || '%' AND payload::text LIKE '%Erê, spas%'`,
    [FROM, TO],
  );
};

// The old meaning was wrong, so there is nothing to put back.
export const down = () => {};
