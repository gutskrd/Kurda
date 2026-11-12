/**
 * The rounds of Who Am I? played alone that are still open are given up.
 *
 * Who Am I? is played with others only now: a card is on a forehead for
 * somebody else to read, with friends online or on one phone passed round a
 * room. The server has no rules for a round alone any more, so one still open
 * on the day this runs could not be continued, read or finished, and would
 * otherwise sit "open" until its day ran out. Each of them is ended here the
 * way the solo round itself ends a round that is replaced by a new one:
 * expired at once and marked given up, which pays nobody.
 *
 * Nothing is deleted: the rounds and their answers go on being kept, exported
 * and cleared by the same rules as every other round that ended, and the XP
 * they paid stays in the ledger as game XP.
 */

export const up = (pgm) => {
  pgm.sql(`
    UPDATE game_sessions
       SET expires_at = now(), meta = meta || '{"abandoned": true}'::jsonb
     WHERE game = 'who-am-i' AND finished_at IS NULL AND expires_at > now()
  `);
};

/**
 * Nothing to undo: which of the rounds given up were open is not written
 * down anywhere, and a round that was given up is not reopened.
 */
export const down = () => {};
