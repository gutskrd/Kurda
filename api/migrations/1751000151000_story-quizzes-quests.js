/**
 * Event quests that asked for ranked-quiz wins ask for story quizzes instead.
 *
 * A `win_games` quest counted ranked quiz wins (a rating_history row at rank
 * 1). Stories replaced the quiz and nothing records a win any more, so such a
 * quest could never be completed — and event rows are materialized from their
 * templates only when someone runs `npm run events:seed`, so changing the
 * Newroz template alone would leave every year already seeded with an
 * unwinnable 40-Gem quest. This rewrites the stored entries in place, keeping
 * each quest's id (claims are keyed by it), count and reward: type
 * `story_quizzes` (finished story games that counted as learning), with titles
 * to match.
 */

const sqlFor = (from, to, titleEn, titleKu) => `
  UPDATE events e SET quests = (
    SELECT jsonb_agg(
             CASE WHEN q->>'type' = '${from}'
                  THEN q || jsonb_build_object('type', '${to}', 'titleEn', ${titleEn}, 'titleKu', ${titleKu})
                  ELSE q END
             ORDER BY ord)
      FROM jsonb_array_elements(e.quests) WITH ORDINALITY AS t(q, ord))
   WHERE jsonb_typeof(e.quests) = 'array' AND e.quests @> '[{"type": "${from}"}]'::jsonb`;

const NEWROZ = `e.key LIKE 'newroz%'`;

export const up = (pgm) => {
  pgm.sql(
    sqlFor(
      'win_games',
      'story_quizzes',
      `'Finish ' || (q->>'count') || ' story quizzes' || CASE WHEN ${NEWROZ} THEN ' during Newroz' ELSE '' END`,
      `CASE WHEN ${NEWROZ} THEN 'Di rojên Newrozê de pirsên ' || (q->>'count') || ' çîrokan bibersivîne'
            ELSE 'Pirsên ' || (q->>'count') || ' çîrokan bibersivîne' END`,
    ),
  );
};

export const down = (pgm) => {
  pgm.sql(
    sqlFor(
      'story_quizzes',
      'win_games',
      `'Win ' || (q->>'count') || ' quiz games' || CASE WHEN ${NEWROZ} THEN ' during Newroz' ELSE '' END`,
      `CASE WHEN ${NEWROZ} THEN 'Di rojên Newrozê de ' || (q->>'count') || ' lîstikan bibe'
            ELSE (q->>'count') || ' lîstikan bibe' END`,
    ),
  );
};
