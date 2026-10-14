/**
 * Chat messages that are more than text: a gift, unwrapped in the chat, and a
 * game card, to join a friend's game from the chat.
 *
 * Both used to be impossible to store — a message was a body of text and
 * nothing else — so a gift arrived only as a line in the notifications, and a
 * game invite was a link pasted as text and parsed back out. A message now has
 * a kind, and the reference it needs: the gift batch (one gift row per
 * recipient, so a gift to three people in a group is one message) or the game
 * and its lobby. The text body is only required of text messages.
 *
 * gifts gain a batch (existing rows each become their own batch of one) and an
 * opened time, separate from seen: "seen" clears a badge, "opened" is the
 * unwrapping, and the sender's bubble says so.
 */

const GAMES = "('wordle-battle','rhyme-match','stories')";

export const up = (pgm) => {
  pgm.addColumns('gifts', {
    batch_id: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
    opened_at: { type: 'timestamptz' },
  });
  pgm.createIndex('gifts', 'batch_id');

  for (const table of ['dm_messages', 'group_messages']) {
    pgm.addColumns(table, {
      kind: { type: 'text', notNull: true, default: 'text' },
      gift_batch_id: { type: 'uuid' },
      game: { type: 'text' },
      game_lobby_id: { type: 'uuid' },
    });
    pgm.alterColumn(table, 'body', { notNull: false });
    pgm.dropConstraint(table, `${table}_len_check`);
    pgm.addConstraint(table, `${table}_len_check`, {
      check: 'body IS NULL OR char_length(body) BETWEEN 1 AND 2000',
    });
    pgm.addConstraint(table, `${table}_kind_check`, {
      check: `(kind = 'text' AND body IS NOT NULL)
           OR (kind = 'gift' AND gift_batch_id IS NOT NULL)
           OR (kind = 'game' AND game IN ${GAMES} AND game_lobby_id IS NOT NULL)`,
    });
  }
};

export const down = (pgm) => {
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.sql(`DELETE FROM ${table} WHERE kind <> 'text'`);
    pgm.dropConstraint(table, `${table}_kind_check`);
    pgm.dropConstraint(table, `${table}_len_check`);
    pgm.alterColumn(table, 'body', { notNull: true });
    pgm.addConstraint(table, `${table}_len_check`, { check: 'char_length(body) BETWEEN 1 AND 2000' });
    pgm.dropColumns(table, ['kind', 'gift_batch_id', 'game', 'game_lobby_id']);
  }
  pgm.dropIndex('gifts', 'batch_id');
  pgm.dropColumns('gifts', ['batch_id', 'opened_at']);
};
