/**
 * What the gift rules ask of the database, made cheap.
 *
 * A gift now counts against a daily cap — so many per sender, so many to any
 * one friend, over the last 24 hours — and every send asks "how many has this
 * person given since yesterday at this time". The gifts table was only indexed
 * for the recipient's side (their list, their unopened count), so that question
 * read every gift the sender had ever given.
 *
 * And a gift lives in a chat message now (1751000148000): opening one tells
 * the sender, or the group, which message changed, and closing a child's
 * account removes the gift messages that were theirs. Both look a message up by
 * its gift batch, which nothing indexed. Partial, because text messages — all
 * but a handful — have no batch to index.
 */

export const up = (pgm) => {
  pgm.createIndex('gifts', ['from_user_id', 'created_at']);
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.createIndex(table, 'gift_batch_id', { where: 'gift_batch_id IS NOT NULL' });
  }
};

export const down = (pgm) => {
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.dropIndex(table, 'gift_batch_id');
  }
  pgm.dropIndex('gifts', ['from_user_id', 'created_at']);
};
