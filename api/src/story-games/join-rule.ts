import type pg from 'pg';
import type { GameAccess } from '@kurda/shared';
import { areFriendsSql, notKnownAdultSql } from '../users/age.js';

type Executor = Pick<pg.Pool, 'query'>;

/** What the join rule looks at, gathered for one joiner and one game. */
export interface JoinFacts {
  /** the host removed them from this game earlier */
  removed: boolean;
  /** a block, either way, between the joiner and anyone in the game (present, gone or removed) */
  blocked: boolean;
  access: GameAccess;
  joinerIsKnownAdult: boolean;
  /** the joiner is the host (coming back to their own game) */
  isHost: boolean;
  friendsWithHost: boolean;
  /** the host shared the game into a group chat the joiner is a member of */
  inSharedGroup: boolean;
}

/**
 * Who may join a game: the rule every online game shares (contract §B2; the
 * play module's `canJoin` is its twin for Wordle Battle and Rhyme Match).
 *
 * Never anyone the host removed, and never anyone with a block either way
 * against anyone in the game — a block is checked against the whole roster,
 * not just the host, so blocking someone also keeps them out of every lobby
 * you are in. Then:
 * - an 'open' game takes any known adult, and only known adults: a minor or
 *   an account of unknown age never joins one, even a friend of the host's,
 *   so every member of an open game is an adult and a child is never in a game
 *   strangers could walk into;
 * - a 'friends' game takes the host's accepted friends, and the members of a
 *   group chat the host shared it into (minors are never in open groups, so
 *   that brings in nobody a child could not already talk to).
 * A refusal is never explained to the joiner: it looks exactly like a game
 * that does not exist.
 */
export function canJoin(f: JoinFacts): boolean {
  if (f.removed || f.blocked) return false;
  if (f.access === 'open') return f.joinerIsKnownAdult;
  return f.isHost || f.friendsWithHost || f.inSharedGroup;
}

/** The facts for `canJoin`, in one query. */
export async function joinFacts(
  executor: Executor,
  game: { id: string; hostId: string | null; access: GameAccess; chatGroupId: string | null },
  joinerId: string,
): Promise<JoinFacts> {
  const res = await executor.query<{
    removed: boolean;
    blocked: boolean;
    adult: boolean;
    friends: boolean;
    in_group: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM story_game_players p WHERE p.game_id = $1 AND p.user_id = $2 AND p.removed) AS removed,
       EXISTS (SELECT 1 FROM story_game_players p JOIN blocks b
                 ON (b.blocker_id = p.user_id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = p.user_id)
                WHERE p.game_id = $1 AND p.user_id <> $2) AS blocked,
       COALESCE((SELECT NOT ${notKnownAdultSql('u')} FROM users u WHERE u.id = $2 AND u.deleted_at IS NULL), false) AS adult,
       ($3::uuid IS NOT NULL AND ${areFriendsSql('$2::uuid', '$3::uuid')}) AS friends,
       ($4::uuid IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
           WHERE gm.group_id = $4 AND gm.user_id = $2 AND g.archived_at IS NULL)) AS in_group`,
    [game.id, joinerId, game.hostId, game.chatGroupId],
  );
  const r = res.rows[0]!;
  return {
    removed: r.removed,
    blocked: r.blocked,
    access: game.access,
    joinerIsKnownAdult: r.adult,
    isHost: game.hostId === joinerId,
    friendsWithHost: r.friends,
    inSharedGroup: r.in_group,
  };
}

/** Whether someone is a known adult right now (may host an open game). */
export async function isKnownAdult(executor: Executor, userId: string): Promise<boolean> {
  const res = await executor.query<{ adult: boolean }>(
    `SELECT NOT ${notKnownAdultSql('u')} AS adult FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
  return res.rows[0]?.adult ?? false;
}
