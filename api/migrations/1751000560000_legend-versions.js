/**
 * The five legends are one story each, told in both varieties.
 *
 * `stories.translation_group` links the tellings of one story (migration
 * story-library), and the reader offers the other telling by it. The legends
 * were seeded from api/content/stories/legends.json as ten stories: each pair
 * shares a tale and a cover, and nothing in the table said so. The library
 * showed every legend twice, and the reader had no way from one telling to
 * the other. This links each pair, by slug.
 *
 * A pair is linked only where both stories are there and neither is in a
 * group yet: a pair an editor linked in the panel, or linked to something
 * else, stays as the editor made it. Run again, it finds every pair in a
 * group and changes nothing.
 *
 * On a new database there is nothing to link here: migrations run before the
 * API starts, and the API seeds the legends when it starts. The seeding links
 * each pair itself once both stories are in (api/src/stories/import.ts,
 * `linkStarterVersions`). Nothing that brings a story up to its file writes
 * the group (`saveStory` writes the content alone), so the link outlives
 * every later import and every later start.
 *
 * Down unlinks a pair where the two are still alone in one group. A group an
 * editor has since added another telling to is theirs, and is kept.
 */

/** Each legend's two tellings: [Kurmancî slug, Soranî slug]. */
export const PAIRS = [
  ['kmr-kawaye-hesinkar', 'ckb-kaway-asinger'],
  ['kmr-sahmaran', 'ckb-shamaran'],
  ['kmr-mem-u-zin', 'ckb-mem-u-zin'],
  ['kmr-siyabend-u-xece', 'ckb-siyabend-u-xece'],
  ['kmr-kela-dimdime', 'ckb-qelay-dimdim'],
];

export const up = async (pgm) => {
  for (const [kmr, ckb] of PAIRS) {
    // the pair is read once and kept (MATERIALIZED), so both stories are given the same new group
    await pgm.db.query(
      `WITH pair AS MATERIALIZED (
         SELECT a.id AS kmr, b.id AS ckb, gen_random_uuid() AS translation_group
           FROM stories a, stories b
          WHERE a.slug = $1 AND b.slug = $2 AND a.translation_group IS NULL AND b.translation_group IS NULL
       )
       UPDATE stories s SET translation_group = pair.translation_group FROM pair WHERE s.id IN (pair.kmr, pair.ckb)`,
      [kmr, ckb],
    );
  }
};

export const down = async (pgm) => {
  for (const [kmr, ckb] of PAIRS) {
    await pgm.db.query(
      `UPDATE stories s SET translation_group = NULL
         FROM stories a, stories b
        WHERE a.slug = $1 AND b.slug = $2 AND a.translation_group = b.translation_group
          AND s.id IN (a.id, b.id)
          AND (SELECT count(*) FROM stories g WHERE g.translation_group = a.translation_group) = 2`,
      [kmr, ckb],
    );
  }
};
