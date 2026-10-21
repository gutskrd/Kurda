/**
 * Speaking characters: who says each recording, and how their mouth moves.
 *
 * When a recording plays, a learner can see one of three characters say it —
 * Hevalo the deer, Hamo or Xezo (SPEAKERS in @kurda/shared) — with the mouth
 * moving in time with the sound. Every kind of recording gets the same two
 * columns: the lesson and story sentences (lesson_audio), the alphabet's
 * sounds (alphabet_audio) and the dictionary's pronunciations (dict_audio).
 *
 * `speaker` is which character says it. NULL means none is shown, which is
 * what every recording made before the characters existed does until an
 * editor chooses one; the apps are sent a speaker and a timeline only for
 * recordings that have a speaker.
 *
 * `lipsync` is the mouth's timeline for this one recording, in the compact
 * form `encodeLipsync` writes ({ v, d, k }: the format's version, the length
 * in ms, and the cues as [ms, shape] pairs). The admin panel makes it in the
 * browser from the recording's sound and its text, and the API checks it with
 * `decodeLipsync` against the recording's length before storing it. It
 * belongs to the take, not to the text: recording a sentence again clears it
 * unless a new one comes with the new take. NULL with a speaker set means the
 * character is chosen but no timeline has been made yet.
 */

const TABLES = ['lesson_audio', 'alphabet_audio', 'dict_audio'];

export const up = (pgm) => {
  for (const table of TABLES) {
    pgm.addColumns(table, {
      speaker: { type: 'text' },
      lipsync: { type: 'jsonb' },
    });
    pgm.addConstraint(table, `${table}_speaker_check`, {
      check: "speaker IS NULL OR speaker IN ('hevalo', 'hamo', 'xezo')",
    });
    // the API checks every cue; this only keeps anything but a timeline object out
    pgm.addConstraint(table, `${table}_lipsync_check`, {
      check: "lipsync IS NULL OR jsonb_typeof(lipsync) = 'object'",
    });
  }
};

export const down = (pgm) => {
  for (const table of TABLES) {
    pgm.dropConstraint(table, `${table}_lipsync_check`);
    pgm.dropConstraint(table, `${table}_speaker_check`);
    pgm.dropColumns(table, ['speaker', 'lipsync']);
  }
};
