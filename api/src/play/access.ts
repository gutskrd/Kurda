import type pg from 'pg';
import type { GameAccess } from '@kurda/shared';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { areFriendsSql, notKnownAdultSql } from '../users/age.js';

type Executor = Pick<pg.Pool, 'query'>;

/** What the join rule looks at, for one person and one game. */
export interface JoinCheck {
  joinerId: string;
  /** null when the host's account is gone: nobody new joins a game without one */
  hostId: string | null;
  access: GameAccess;
  /** everyone in the game the host has not removed — still there or gone */
  memberIds: readonly string[];
  /** the group chat the host shared the game into, if any */
  chatGroupId: string | null;
  /** the host removed the joiner from this game earlier */
  removed: boolean;
}

/**
 * Who may join a game — one rule for Wordle Battle, Rhyme Match and Stories
 * (contract §B2; @kurda/shared `play` DEFAULT_ACCESS).
 *
 * Never anyone the host removed, and never anyone with a block either way
 * against anyone in the game, present or gone: a block keeps two people out of
 * each other's games, not just out of each other's lobbies as hosts. Then:
 *
 * - an 'open' game takes any known adult, and only known adults — a friend of
 *   the host's who is a minor, or whose age nobody knows, does not join one
 *   either. Only a known adult can open a game (checked where it is created),
 *   so a child is never in a game strangers could walk into;
 * - a 'friends' game takes the host's accepted friends, and the members of an
 *   invite-only group chat the host shared it into. Everyone in an
 *   invite-only group was put there by somebody they chose (groups only invite
 *   friends), so that brings in nobody new to a child.
 *
 * A game shared into an OPEN group lets nobody in on that account. An open
 * group is strangers by design — it is adults-only for that reason — and a
 * friends game can hold the host's friend who is fifteen; letting the group in
 * would be the stranger contact an open game is refused to a minor for. A host
 * who wants the group's adults in opens the game instead. (The contract's
 * wording let any group in; this is the safer reading of the same rule.)
 *
 * The answer is a yes or a no and is never explained: every caller turns a no
 * into the same "not found" as a game that does not exist, so a refusal says
 * nothing about anybody's age or blocks.
 */
export async function canJoin(executor: Executor, check: JoinCheck): Promise<boolean> {
  if (check.removed || check.hostId === null) return false;
  const others = [...new Set([check.hostId, ...check.memberIds])].filter((id) => id !== check.joinerId);
  const res = await executor.query<{ blocked: boolean; adult: boolean; friends: boolean; in_group: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM blocks b
                WHERE (b.blocker_id = $1 AND b.blocked_id = ANY($2::uuid[]))
                   OR (b.blocked_id = $1 AND b.blocker_id = ANY($2::uuid[]))) AS blocked,
       COALESCE((SELECT NOT ${notKnownAdultSql('u')} FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL), false) AS adult,
       ${areFriendsSql('$1::uuid', '$3::uuid')} AS friends,
       ($4::uuid IS NOT NULL AND EXISTS (
          SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
           WHERE gm.group_id = $4 AND gm.user_id = $1
             AND g.archived_at IS NULL AND g.privacy <> 'open')) AS in_group`,
    [check.joinerId, others, check.hostId, check.chatGroupId],
  );
  const r = res.rows[0]!;
  if (r.blocked) return false;
  if (check.access === 'open') return r.adult;
  if (check.joinerId === check.hostId) return true;
  return r.friends || r.in_group;
}

/** Whether someone may open a game to every adult with the link: a known adult right now. */
export async function mayHostOpen(executor: Executor, userId: string): Promise<boolean> {
  const res = await executor.query<{ adult: boolean }>(
    `SELECT NOT ${notKnownAdultSql('u')} AS adult FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
  return res.rows[0]?.adult ?? false;
}

/** A name and face one player may be shown for another. */
export interface Identity {
  name: string;
  avatarUrl: string | null;
}

/**
 * The identity rule (contract §B2, as for Stories): the players whose name and
 * picture `viewerId` may see — accepted friends, and in an 'open' game (every
 * member a known adult, by the join rule) anyone with no block either way.
 * Everyone else is "Player N" with the default picture, so in a friends game a
 * missing name means "not my friend" and nothing about anyone's age.
 *
 * The viewer's own entry is the caller's to fill; it is never looked up here.
 */
export async function identities(
  executor: Executor,
  viewerId: string,
  userIds: readonly string[],
  access: GameAccess,
  publicUrl: PublicUrl = () => null,
): Promise<Map<string, Identity>> {
  const others = [...new Set(userIds)].filter((id) => id !== viewerId);
  const shown = new Map<string, Identity>();
  if (others.length === 0) return shown;
  const res = await executor.query<{
    id: string;
    username: string;
    display_name: string | null;
    profile_photo_key: string | null;
    selected_avatar_key: string | null;
  }>(
    `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key
       FROM users u
      WHERE u.id = ANY($2::uuid[]) AND u.deleted_at IS NULL
        AND (${areFriendsSql('u.id', '$1::uuid')}
             OR ($3 = 'open' AND NOT EXISTS (
                   SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))))`,
    [viewerId, others, access],
  );
  for (const r of res.rows) {
    shown.set(r.id, {
      name: r.display_name?.trim() || r.username,
      avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
    });
  }
  return shown;
}
