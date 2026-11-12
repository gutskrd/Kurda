/**
 * The open games of Don't Say the Word! and Kurdish Bluff are called off.
 *
 * Both games are no longer part of Hevalo: the server has no rules for them
 * and nothing lists, opens or starts one. Whatever was played stays as it is.
 * A lobby still waiting for players, or a game still under way, on the day
 * this runs would otherwise stay "open" for ever, because the sweep that
 * closes idle lobbies and ends stuck games only walks the games there are. So
 * each of them is ended here, the way a lobby nobody started is ended:
 * called off, which pays nobody and rates nobody.
 *
 * The status change releases the lobby's join code (the trigger from
 * game-join-codes). Nothing is deleted: the rows, their players and what was
 * typed in them go on being kept, exported and cleared by the same rules as
 * every other game that ended.
 */

export const up = (pgm) => {
  pgm.sql(`
    UPDATE game_lobbies
       SET status = 'cancelled', finished_at = now(), due_at = NULL, updated_at = now(), version = version + 1
     WHERE game IN ('dont-say', 'bluff') AND status IN ('lobby', 'active')
  `);
};

/**
 * Nothing to undo: which of the games called off were open is not written
 * down anywhere, and a game that was called off is not reopened.
 */
export const down = () => {};
