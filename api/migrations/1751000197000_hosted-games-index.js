/**
 * The games a host has going, found fast.
 *
 * A host keeps at most three Peyvok Battles and three Rhyme Matches of their
 * own at once (@kurda/shared `MAX_HOSTED_GAMES`, play/lobby.ts
 * `makeRoomToHost`), counted every time one is made. Neither table had an
 * index on who made a game, so that count read the whole table. Partial: only
 * games not yet over are ever counted, and those are few.
 */

export const up = (pgm) => {
  pgm.createIndex('wordle_battles', ['created_by', 'created_at'], {
    name: 'wordle_battles_hosting_index',
    where: 'finished_at IS NULL',
  });
  pgm.createIndex('rhyme_matches', ['created_by', 'created_at'], {
    name: 'rhyme_matches_hosting_index',
    where: 'finished_at IS NULL',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('rhyme_matches', [], { name: 'rhyme_matches_hosting_index' });
  pgm.dropIndex('wordle_battles', [], { name: 'wordle_battles_hosting_index' });
};
