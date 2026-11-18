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
  /** The host removed the joiner from this game earlier. */
  removed: boolean;
}

/**
 * Who may join a game, one rule for Peyvok Battle, Rhyme Match and Stories (@kurda/shared `play` DEFAULT_ACCESS).
 * Never anyone the host removed, and never anyone with a block either way against anyone in the game, present or
 * gone. Then:
 *
 * - an 'open' game takes only known adults, friends of the host included; only a known adult can open one, so a child
 *   is never in a game strangers can walk into;
 * - a 'friends' game takes the host's friends and the members of a group chat it was shared into, while the host is
 *   still a member. Every group is private and filled by members' own friends, so this brings no stranger to a child.
 *
 * A game shared into a formerly open group (`groups.privacy` 'open', migration 1751000420000) admits nobody on that
 * account: its members are strangers, and a friends game may hold the host's teenage friend. A host who wants them
 * opens the game instead. The answer is never explained: callers turn every no into the same "not found", so a
 * refusal reveals nothing about age or blocks.
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
             AND g.archived_at IS NULL AND g.privacy <> 'open'
             AND EXISTS (SELECT 1 FROM group_members h WHERE h.group_id = $4 AND h.user_id = $3))) AS in_group`,
    [check.joinerId, others, check.hostId, check.chatGroupId],
  );
  const r = res.rows[0]!;
  if (r.blocked) return false;
  if (check.access === 'open') return r.adult;
  if (check.joinerId === check.hostId) return true;
  return r.friends || r.in_group;
}

/**
 * The players `viewerId` may not exchange free text with in a game where players write to each other: anyone with a
 * block either way, and, when either is a minor or of unknown age, anyone not their friend. Symmetric, so neither
 * sees what the other may not. This keeps a child in a friends lobby of strangers from writing to or reading them.
 */
export async function textApart(executor: Executor, viewerId: string, otherIds: readonly string[]): Promise<Set<string>> {
  const others = [...new Set(otherIds)].filter((id) => id !== viewerId);
  if (others.length === 0) return new Set();
  const res = await executor.query<{ id: string }>(
    `SELECT o.id FROM users v JOIN users o ON o.id = ANY($2::uuid[]) AND o.deleted_at IS NULL
      WHERE v.id = $1
        AND (EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = v.id AND b.blocked_id = o.id) OR (b.blocker_id = o.id AND b.blocked_id = v.id))
             OR ((${notKnownAdultSql('v')} OR ${notKnownAdultSql('o')}) AND NOT ${areFriendsSql('v.id', 'o.id')}))`,
    [viewerId, others],
  );
  return new Set(res.rows.map((r) => r.id));
}

/**
 * Whether `joinerId` may sit with these members in a game where players write to each other: none is someone they may
 * not exchange text with (`textApart`). Asked alongside `canJoin`, so minors only ever sit with their friends.
 */
export async function maySitTogether(executor: Executor, joinerId: string, memberIds: readonly string[]): Promise<boolean> {
  return (await textApart(executor, joinerId, memberIds)).size === 0;
}

/** Whether someone may open a game to every adult with the link: a known adult now. */
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
 * The identity rule: the players whose name and picture `viewerId` may see, friends and, in an 'open' game (all known
 * adults by the join rule), anyone without a block either way. Everyone else is "Player N" with the default picture,
 * so a missing name means only "not my friend". The viewer's own entry is the caller's to fill.
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
