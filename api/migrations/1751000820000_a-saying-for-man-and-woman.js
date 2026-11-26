/**
 * The lesson that teaches mêr, jin and ajel (u02s1l3) ends its run of "man" and "woman" with Hamo's favourite saying,
 * "Şêr şêr e, çi jin e, çi mêr e." The road's file has it already, but a published lesson never follows its file again,
 * so this puts it into the published lesson in place of item 14, a fourth drill of "I’m a woman."
 *
 * Its answer keeps its place (the first option), so a lesson already open still checks the same way, and the item is
 * matched by its lesson, place and old words, so nothing else is touched. Until Hamo records the saying it shows as text
 * with nothing to play. Published exercises are guarded against edits; the guard is lifted for this one update, inside
 * the migration's transaction, as in 1751000770000.
 */

const OLD = {
  ask: 'choose-kurdish',
  voice: 'xezo',
  prompt: 'I’m a woman.',
  options: ['Ez jin im.', 'Ez jin me.', 'Ez mêr im.'],
  correctIndex: 0,
};

const SAYING = {
  ask: 'meaning',
  say: 'Şêr şêr e, çi jin e, çi mêr e.',
  voice: 'hamo',
  cue: 'Hamo’s favourite saying',
  prompt: 'Şêr şêr e, çi jin e, çi mêr e.',
  options: ['A lion is a lion, whether woman or man.', 'A man is a lion, and a woman is a guest.', 'An animal is an animal, whether big or small.'],
  correctIndex: 0,
  new: [{ ku: 'şêr', en: 'lion' }],
};

/** Replaces the payload of item 14 of the published u02s1l3 where it is still `from`. */
async function swap(pgm, from, to) {
  await pgm.db.query('ALTER TABLE exercises DISABLE TRIGGER exercises_no_published_rewrite');
  await pgm.db.query(
    `UPDATE exercises e SET payload = $2::jsonb
      WHERE e.type = 'multiple_choice'
        AND e.position = 14
        AND e.payload->>'ask' = $1::jsonb->>'ask'
        AND e.payload->>'prompt' = $1::jsonb->>'prompt'
        AND e.lesson_id IN (
          SELECT l.id FROM lessons l
            JOIN skills s ON s.id = l.skill_id
            JOIN units u ON u.id = s.unit_id
            JOIN courses c ON c.id = u.course_id
           WHERE c.slug = 'kurmanji-road' AND u.position = 2 AND s.position = 1 AND l.position = 3 AND l.status = 'published')`,
    [JSON.stringify(from), JSON.stringify(to)],
  );
  await pgm.db.query('ALTER TABLE exercises ENABLE TRIGGER exercises_no_published_rewrite');
}

export const up = (pgm) => swap(pgm, OLD, SAYING);

export const down = (pgm) => swap(pgm, SAYING, OLD);
