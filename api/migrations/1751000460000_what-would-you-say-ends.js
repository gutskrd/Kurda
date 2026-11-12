/**
 * The open rounds of What Would You Say? are given up.
 *
 * The game is no longer part of Hevalo: the server has no rules for it and
 * nothing lists, opens or starts a round of it. Whatever was played stays as
 * it is. A round still open on the day this runs could not be continued, read
 * or finished any more, and would otherwise sit "open" until its day ran out.
 * So each of them is ended here the way the solo round itself ends a round
 * that is replaced by a new one: expired at once and marked given up, which
 * pays nobody.
 *
 * Nothing is deleted: the rounds and their answers go on being kept, exported
 * and cleared by the same rules as every other round that ended, and the XP
 * the game paid stays in the ledger as game XP.
 */

export const up = (pgm) => {
  pgm.sql(`
    UPDATE game_sessions
       SET expires_at = now(), meta = meta || '{"abandoned": true}'::jsonb
     WHERE game = 'what-would-you-say' AND finished_at IS NULL AND expires_at > now()
  `);
};

/**
 * Nothing to undo: which of the rounds given up were open is not written
 * down anywhere, and a round that was given up is not reopened.
 */
export const down = () => {};
