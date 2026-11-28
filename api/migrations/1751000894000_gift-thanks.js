/**
 * A one-tap thanks for a gift becomes a message of its own kind, 'thanks', pointing at the gift it answers, so the
 * apps draw it as a quiet line under the gift instead of a bubble someone seems to have typed. The gift row records
 * when its recipient said thanks (`thanked_at`), which keeps it to one thanks per gift and lets the cards say so.
 *
 * A thanks keeps a short text body as well, for apps that do not know the kind yet. The thank-you texts the apps sent
 * before this, in each of their languages, are turned into thanks messages for the latest gift the thanker had been
 * given in that chat, once per gift.
 */

/** The chat tables, whose `kind` check names the kinds and the games a game card may be for. */
const MESSAGE_TABLES = ['dm_messages', 'group_messages'];

/** The thank-you text the apps sent as a plain message, in every language they spoke when this shipped. */
const THANKS_TEXTS = [
  'Spas! Thank you for the gift 💛',
  'Spas ji bo diyariyê! 💛',
  'سوپاس بۆ دیارییەکە! 💛',
  'Spas! شكرًا على الهدية 💛',
  'Spas! Hediye için teşekkürler 💛',
  'Spas! Danke für das Geschenk 💛',
  'Spas! Bedankt voor het cadeau 💛',
  'Spas ! Merci pour le cadeau 💛',
  '¡Spas! Gracias por el regalo 💛',
];

const list = (games) => `(${games.map((g) => `'${g}'`).join(',')})`;
const literals = (text) => [...text.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]);

const kindCheck = (games, thanks) => `(kind = 'text' AND body IS NOT NULL)
           OR (kind = 'gift' AND gift_batch_id IS NOT NULL)
           OR (kind = 'game' AND game IN ${list(games)} AND game_lobby_id IS NOT NULL)${
             thanks ? `\n           OR (kind = 'thanks' AND gift_batch_id IS NOT NULL AND body IS NOT NULL)` : ''
           }`;

/** The games a chat table's game card may name now: the list inside its `kind = 'game'` branch. */
async function cardGames(pgm, table) {
  const res = await pgm.db.query(
    `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c WHERE c.conrelid = to_regclass($1) AND c.conname = $2`,
    [table, `${table}_kind_check`],
  );
  if (!res.rows[0]) throw new Error(`no check ${table}_kind_check`);
  const def = res.rows[0].def;
  const inside = def.match(/game\s*=\s*ANY\s*\(\s*\(?ARRAY\[([^\]]*)\]/i) ?? def.match(/game\s+IN\s*\(([^)]*)\)/i);
  if (!inside) throw new Error(`cannot read the games in ${table}_kind_check`);
  return literals(inside[1]);
}

async function rebuildCheck(pgm, table, thanks) {
  const games = await cardGames(pgm, table);
  await pgm.db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kind_check`);
  await pgm.db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(games, thanks)}) NOT VALID`);
}

/** Where a message sits: the two people of a direct message, or the group. */
const SAME_CHAT = {
  dm_messages: 'gm.user_lo = t.user_lo AND gm.user_hi = t.user_hi',
  group_messages: 'gm.group_id = t.group_id',
};

export const up = async (pgm) => {
  await pgm.db.query(`ALTER TABLE gifts ADD COLUMN thanked_at timestamptz`);
  for (const table of MESSAGE_TABLES) {
    await rebuildCheck(pgm, table, true);
    // Each earlier thank-you answers the latest gift its writer had been given in that chat before it; a second
    // thank-you for the same gift stays the text it was.
    await pgm.db.query(
      `WITH said AS (
         SELECT t.id AS message_id, t.created_at, g.id AS gift_id, g.batch_id,
                row_number() OVER (PARTITION BY g.id ORDER BY t.created_at, t.id) AS nth
           FROM ${table} t
           JOIN LATERAL (
             SELECT gm.gift_batch_id FROM ${table} gm
              WHERE ${SAME_CHAT[table]} AND gm.kind = 'gift' AND gm.sender_id <> t.sender_id AND gm.created_at <= t.created_at
              ORDER BY gm.created_at DESC LIMIT 1
           ) given ON true
           JOIN gifts g ON g.batch_id = given.gift_batch_id AND g.to_user_id = t.sender_id AND g.thanked_at IS NULL
          WHERE t.kind = 'text' AND t.body = ANY($1::text[])
       ), first AS (
         SELECT * FROM said WHERE nth = 1
       ), marked AS (
         UPDATE gifts g SET thanked_at = f.created_at FROM first f WHERE g.id = f.gift_id RETURNING g.id
       )
       UPDATE ${table} m SET kind = 'thanks', gift_batch_id = f.batch_id
         FROM first f WHERE m.id = f.message_id`,
      [THANKS_TEXTS],
    );
  }
};

export const down = async (pgm) => {
  for (const table of MESSAGE_TABLES) {
    // a thanks keeps its text, so it reads as the plain message it would have been
    await pgm.db.query(`UPDATE ${table} SET kind = 'text', gift_batch_id = NULL WHERE kind = 'thanks'`);
    await rebuildCheck(pgm, table, false);
  }
  await pgm.db.query(`ALTER TABLE gifts DROP COLUMN thanked_at`);
};
