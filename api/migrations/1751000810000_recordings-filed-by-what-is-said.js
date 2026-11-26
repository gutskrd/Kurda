/**
 * One recording for each sentence as it is said. A take's key now leaves out a character's name written in front as a
 * label ("Hamo: …") and reads punctuation inside the sentence as a word break (`lessonAudioKey` in @kurda/shared), so a
 * sentence written with a comma in one place and without it in another is one take, recorded once.
 *
 * Every take moves to its new key; a conversation line's and a reaction's keep their conversation, part or character
 * and move by the words after them. Where takes now share a key, the one already under it stays, or else the newest
 * moves and the others keep their old keys: nothing is deleted. Each move is logged, so `down` can put it back.
 */

const JOIN = '⁠';
const SPEAKER_LABEL = /^(?:hamo|xezo|hevalo)\s*:\s*(?=\S)/u;
const INNER_MARKS = /[\s"“”«»„‘’'`.!?…,;:·()[\]{}/—–\-؟۔،؛]+/gu;

/** The words' part of a key as the new rule files it; a copy of the rule as it stands today. */
const said = (words) => words.replace(SPEAKER_LABEL, '').replace(INNER_MARKS, ' ').trim();

/** A take's new key: the words after the last joiner of a conversation line's or reaction's key, or the whole key. */
export function rekey(key) {
  const at = key.lastIndexOf(JOIN);
  return at === -1 ? said(key) : key.slice(0, at + 1) + said(key.slice(at + 1));
}

export const up = async (pgm) => {
  await pgm.db.query(
    `CREATE TABLE lesson_audio_key_moves (
       old_key text PRIMARY KEY,
       new_key text NOT NULL,
       moved_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const { rows } = await pgm.db.query('SELECT key, updated_at FROM lesson_audio ORDER BY updated_at DESC, key');
  const taken = new Set(rows.map((r) => r.key));
  const claimed = new Set();
  for (const { key } of rows) {
    const next = rekey(key);
    if (next === key || next === '' || next.endsWith(JOIN)) continue;
    // a take already under the new key keeps it, and the newest of the rest claims it first
    if (taken.has(next) || claimed.has(next)) continue;
    claimed.add(next);
    await pgm.db.query('UPDATE lesson_audio SET key = $2 WHERE key = $1', [key, next]);
    await pgm.db.query('INSERT INTO lesson_audio_key_moves (old_key, new_key) VALUES ($1, $2)', [key, next]);
  }
};

export const down = async (pgm) => {
  await pgm.db.query(
    `UPDATE lesson_audio a SET key = m.old_key
       FROM lesson_audio_key_moves m
      WHERE a.key = m.new_key AND NOT EXISTS (SELECT 1 FROM lesson_audio b WHERE b.key = m.old_key)`,
  );
  await pgm.db.query('DROP TABLE lesson_audio_key_moves');
};
