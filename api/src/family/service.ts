/**
 * Families (shared/src/family.ts): an adult owner and up to five more people, adults who came with the owner's code,
 * teens the owner already supervises, and child profiles. Everything a membership depends on is read again under the
 * owner's lock when it changes, so two people racing for the last place make one member. The family sees one board
 * of everyone's XP this week, and nobody outside it does.
 */
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import {
  FAMILY_CODE_LENGTH,
  FAMILY_CODE_TTL_HOURS,
  MAX_FAMILY_SIZE,
  normalizeFamilyCode,
  PARENT_CODE_ALPHABET,
  type FamilyBoardRow,
  type FamilyPerson,
  type FamilyRole,
  type PurchaseRequestKind,
  type PurchaseRequestStatus,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { inTransaction, type Executor } from '../moderation/tx.js';
import { lockPersonFor } from '../limits/limits.js';
import { moderationKeyed } from '../moderation/pseudonym.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { minorSql } from '../users/age.js';
import { mayBeParent, parentalAccount } from '../parental/service.js';
import { tellParental } from '../parental/notices.js';
import {
  avatarOf,
  codeInvalid,
  createFamilyIfNone,
  familyFull,
  familySize,
  inAnotherFamily,
  membershipOf,
  nameOf,
  notAdult,
  notAdultReason,
  notFound,
  ownerOnly,
  weekStart,
  type Membership,
  type NotAdultReason,
  type PersonColumns,
} from './common.js';
import { askedNotice, joinedNotice, leftNotice, removedNotice, teenAddedNotice, type Named } from './notices.js';
import type { ChildService, ChildSummary } from './children.js';

/** A member as their family sees them, with who made a child's profile. */
export interface FamilyMember extends FamilyPerson {
  joinedAt: string;
  /** a child's parent, who looks after the profile */
  parentId?: string;
}

export interface FamilyOverview {
  /** the caller's part in their family, or null outside one */
  role: FamilyRole | null;
  /** whether the caller may start a family, join one or make a child's profile, and why not */
  adult: boolean;
  reason?: NotAdultReason | null;
  family: {
    id: string;
    ownerId: string;
    size: number;
    max: number;
    plusUntil: string | null;
    members: FamilyMember[];
    board: FamilyBoardRow[];
    /** the owner's code out for adults: only when it expires, since the code itself is shown once */
    invite: { expiresAt: string } | null;
  } | null;
  /** the child profiles the caller made */
  children: ChildSummary[];
  /** for the owner: the teens they supervise who are in no family yet */
  teensToAdd: FamilyPerson[];
  /** the caller has a family PIN, which a profile switch needs to come back */
  pinSet: boolean;
  /** what the caller's children have asked for and wait on an answer */
  asks: number;
}

export interface PurchaseRequest {
  id: string;
  childId: string;
  childName: string;
  kind: PurchaseRequestKind;
  product: string;
  status: PurchaseRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface FamilyDeps {
  push?: (userId: string, notification: import('../push/service.js').Notification) => Promise<void>;
  publicUrl?: PublicUrl;
}

/** A family code: FAMILY_CODE_LENGTH letters from the parent code's alphabet, by the system's secure random source. */
export function makeFamilyCode(): string {
  let code = '';
  for (let i = 0; i < FAMILY_CODE_LENGTH; i++) code += PARENT_CODE_ALPHABET[randomInt(PARENT_CODE_ALPHABET.length)];
  return code;
}

/** A family code as stored: keyed with the server's secret, as a parent's code is. */
export function hashFamilyCode(code: string): string {
  return moderationKeyed('family-code', code);
}

interface MemberRow extends PersonColumns {
  role: FamilyRole;
  joined_at: Date;
  parent_id: string | null;
  xp: number;
}

export class FamilyService {
  private readonly publicUrl: PublicUrl;
  private children: ChildService | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: FamilyDeps = {},
  ) {
    this.publicUrl = deps.publicUrl ?? (() => null);
  }

  /** The child profiles' service, which the overview lists the caller's children through. */
  useChildren(children: ChildService): void {
    this.children = children;
  }

  private named(row: Pick<PersonColumns, 'id' | 'username' | 'display_name'>): Named {
    return { id: row.id, name: nameOf(row) };
  }

  /** Everything the family page shows the caller: their part, their family and its board, their children, and what waits. */
  async overview(userId: string, now: Date = new Date()): Promise<FamilyOverview> {
    const account = await parentalAccount(this.pool, userId);
    if (!account) throw notFound();
    const adult = mayBeParent(account, now);
    const membership = await membershipOf(this.pool, userId);
    const [family, children, teensToAdd, pin, asks] = await Promise.all([
      membership ? this.familyView(membership, now) : Promise.resolve(null),
      account.kind !== 'child' ? (this.children?.summaries(userId, now) ?? Promise.resolve([])) : Promise.resolve([]),
      membership?.role === 'owner' ? this.teensToAdd(userId) : Promise.resolve([]),
      this.pool.query(`SELECT 1 FROM family_pins WHERE parent_id = $1`, [userId]),
      this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM child_purchase_requests WHERE parent_id = $1 AND status = 'pending'`, [userId]),
    ]);
    return {
      role: membership?.role ?? null,
      adult,
      ...(adult ? {} : { reason: notAdultReason(account, now) }),
      family,
      children,
      teensToAdd,
      pinSet: (pin.rowCount ?? 0) > 0,
      asks: asks.rows[0]!.n,
    };
  }

  /** One family as its members see it: everyone, the board this week, and whether the owner's code is out. */
  private async familyView(membership: Membership, now: Date): Promise<NonNullable<FamilyOverview['family']>> {
    const [members, family, invite] = await Promise.all([
      this.pool.query<MemberRow>(
        `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, fm.role, fm.joined_at, cp.parent_id,
                COALESCE((SELECT sum(x.amount) FROM xp_ledger x WHERE x.user_id = u.id AND x.created_at >= $2), 0)::int AS xp
           FROM family_members fm
           JOIN users u ON u.id = fm.user_id
           LEFT JOIN child_profiles cp ON cp.user_id = u.id
          WHERE fm.family_id = $1
          ORDER BY CASE fm.role WHEN 'owner' THEN 0 WHEN 'adult' THEN 1 WHEN 'teen' THEN 2 ELSE 3 END, fm.joined_at`,
        [membership.familyId, weekStart(now)],
      ),
      this.pool.query<{ plus_until: Date | null }>(`SELECT plus_until FROM families WHERE id = $1`, [membership.familyId]),
      membership.role === 'owner'
        ? this.pool.query<{ expires_at: Date }>(`SELECT expires_at FROM family_invites WHERE family_id = $1 AND expires_at > $2`, [membership.familyId, now])
        : Promise.resolve({ rows: [] as Array<{ expires_at: Date }> }),
    ]);
    const people: FamilyMember[] = members.rows.map((row) => ({
      userId: row.id,
      name: nameOf(row),
      avatarUrl: avatarOf(row, this.publicUrl),
      role: row.role,
      joinedAt: row.joined_at.toISOString(),
      ...(row.parent_id ? { parentId: row.parent_id } : {}),
    }));
    const board = members.rows
      .map((row, i) => ({ ...people[i]!, xp: Math.max(0, row.xp) }))
      .map(({ userId, name, avatarUrl, role, xp }) => ({ userId, name, avatarUrl, role, xp }))
      .sort((a, b) => b.xp - a.xp);
    const plusUntil = family.rows[0]?.plus_until ?? null;
    return {
      id: membership.familyId,
      ownerId: membership.ownerId,
      size: people.length,
      max: MAX_FAMILY_SIZE,
      plusUntil: plusUntil ? plusUntil.toISOString() : null,
      members: people,
      board,
      invite: invite.rows[0] ? { expiresAt: invite.rows[0].expires_at.toISOString() } : null,
    };
  }

  /** The teens an owner supervises by parental controls who are in no family yet. */
  private async teensToAdd(ownerId: string): Promise<FamilyPerson[]> {
    const r = await this.pool.query<PersonColumns>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key
         FROM parental_links l JOIN users u ON u.id = l.teen_id
        WHERE l.parent_id = $1 AND l.ended_at IS NULL AND u.kind = 'person' AND ${minorSql('u')} AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = u.id)
        ORDER BY l.created_at`,
      [ownerId],
    );
    return r.rows.map((row) => ({ userId: row.id, name: nameOf(row), avatarUrl: avatarOf(row, this.publicUrl), role: 'teen' as const }));
  }

  /** An adult starts a family of their own, with themselves as its owner. */
  async create(userId: string, now: Date = new Date()): Promise<FamilyOverview> {
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', userId);
      const account = await parentalAccount(client, userId);
      if (!account || !mayBeParent(account, now)) throw notAdult(account);
      if (await membershipOf(client, userId)) throw inAnotherFamily();
      await createFamilyIfNone(client, userId, now);
    });
    return this.overview(userId, now);
  }

  /** The owner ends the family: everyone is out of it, and each is told; children stay their parents' profiles. */
  async remove(userId: string): Promise<{ ended: true }> {
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', userId);
      const membership = await membershipOf(client, userId, { lock: true });
      if (!membership) throw notFound();
      if (membership.role !== 'owner') throw ownerOnly();
      const others = await client.query<{ user_id: string }>(
        `SELECT fm.user_id FROM family_members fm WHERE fm.family_id = $1 AND fm.user_id <> $2 AND fm.role <> 'child'`,
        [membership.familyId, userId],
      );
      const owner = await this.person(client, userId);
      await client.query(`DELETE FROM families WHERE id = $1`, [membership.familyId]);
      await tellParental(client, others.rows.map((r) => ({ userId: r.user_id, notification: removedNotice(owner, true) })));
    });
    return { ended: true };
  }

  private async person(db: Executor, userId: string): Promise<Named> {
    const r = await db.query<PersonColumns>(`SELECT id, username, display_name, profile_photo_key, selected_avatar_key FROM users WHERE id = $1`, [userId]);
    const row = r.rows[0];
    if (!row) throw notFound();
    return this.named(row);
  }

  /** The owner's new code for an adult, replacing any they had out. */
  async createInvite(userId: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
    return inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', userId);
      const membership = await membershipOf(client, userId, { lock: true });
      if (!membership) throw notFound();
      if (membership.role !== 'owner') throw ownerOnly();
      if ((await familySize(client, membership.familyId)) >= MAX_FAMILY_SIZE) throw familyFull();
      await client.query(`DELETE FROM family_invites WHERE family_id = $1`, [membership.familyId]);
      const expiresAt = new Date(now.getTime() + FAMILY_CODE_TTL_HOURS * 3_600_000);
      // another family's live code with the same letters is vanishingly rare; a fresh draw goes in instead
      for (let draw = 0; draw < 5; draw++) {
        const code = makeFamilyCode();
        const made = await client.query(
          `INSERT INTO family_invites (family_id, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [membership.familyId, hashFamilyCode(code), expiresAt, now],
        );
        if (made.rowCount) return { code, expiresAt: expiresAt.toISOString() };
      }
      throw new Error('five family codes in a row were already taken');
    });
  }

  /**
   * An adult joins the family whose code they entered. Under the owner's lock the code (then used up), the family's
   * size and the adult are read again; the owner is told.
   */
  async join(userId: string, input: string, now: Date = new Date()): Promise<FamilyOverview> {
    const code = normalizeFamilyCode(input);
    const account = await parentalAccount(this.pool, userId);
    if (!account || !mayBeParent(account, now)) throw notAdult(account);
    const found = code
      ? await this.pool.query<{ family_id: string; owner_id: string }>(
          `SELECT i.family_id, f.owner_id FROM family_invites i JOIN families f ON f.id = i.family_id WHERE i.code_hash = $1`,
          [hashFamilyCode(code)],
        )
      : null;
    const invite = found?.rows[0];
    if (!code || !invite) throw codeInvalid();
    if (invite.owner_id === userId) throw new AppError('FAMILY_OWN_CODE', 400, 'that is your own family’s code: give it to the adult you invite');
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', invite.owner_id);
      await lockPersonFor(client, 'family', userId);
      const live = await client.query(
        `DELETE FROM family_invites WHERE code_hash = $1 AND family_id = $2 AND expires_at > $3 RETURNING family_id`,
        [hashFamilyCode(code), invite.family_id, now],
      );
      if (!live.rowCount) throw codeInvalid();
      if (await membershipOf(client, userId)) throw inAnotherFamily();
      if ((await familySize(client, invite.family_id)) >= MAX_FAMILY_SIZE) throw familyFull();
      await client.query(`INSERT INTO family_members (user_id, family_id, role, joined_at) VALUES ($1, $2, 'adult', $3)`, [userId, invite.family_id, now]);
      const joined = await this.person(client, userId);
      await tellParental(client, [{ userId: invite.owner_id, notification: joinedNotice(joined) }]);
    });
    return this.overview(userId, now);
  }

  /** The owner adds a teen they supervise by parental controls; the teen is told, and can leave. */
  async addTeen(ownerId: string, teenId: string, now: Date = new Date()): Promise<FamilyOverview> {
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', ownerId);
      await lockPersonFor(client, 'family', teenId);
      const membership = await membershipOf(client, ownerId, { lock: true });
      if (!membership) throw notFound();
      if (membership.role !== 'owner') throw ownerOnly();
      const linked = await client.query(
        `SELECT 1 FROM parental_links l JOIN users u ON u.id = l.teen_id
          WHERE l.parent_id = $1 AND l.teen_id = $2 AND l.ended_at IS NULL AND u.kind = 'person' AND ${minorSql('u')}`,
        [ownerId, teenId],
      );
      if (!linked.rowCount) throw notFound();
      if (await membershipOf(client, teenId)) throw inAnotherFamily();
      if ((await familySize(client, membership.familyId)) >= MAX_FAMILY_SIZE) throw familyFull();
      await client.query(`INSERT INTO family_members (user_id, family_id, role, joined_at) VALUES ($1, $2, 'teen', $3)`, [teenId, membership.familyId, now]);
      await tellParental(client, [{ userId: teenId, notification: teenAddedNotice(await this.person(client, ownerId)) }]);
    });
    return this.overview(ownerId, now);
  }

  /** An adult or teen leaves their family; an adult's children leave with them. The owner is told. */
  async leave(userId: string): Promise<{ left: true }> {
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', userId);
      const membership = await membershipOf(client, userId, { lock: true });
      if (!membership) throw notFound();
      if (membership.role === 'owner') throw new AppError('FAMILY_OWNER_LEAVES', 409, 'the person who started the family ends it instead of leaving');
      await takeOut(client, membership.familyId, userId);
      await tellParental(client, [{ userId: membership.ownerId, notification: leftNotice(await this.person(client, userId)) }]);
    });
    return { left: true };
  }

  /** The owner takes someone out: an adult with their children, a teen, or a child, who stays their parent's profile. */
  async removeMember(ownerId: string, memberId: string): Promise<{ removed: true }> {
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', ownerId);
      const membership = await membershipOf(client, ownerId, { lock: true });
      if (!membership) throw notFound();
      if (membership.role !== 'owner') throw ownerOnly();
      if (memberId === ownerId) throw new AppError('FAMILY_OWNER_LEAVES', 409, 'the person who started the family ends it instead of leaving');
      const theirs = await membershipOf(client, memberId);
      if (!theirs || theirs.familyId !== membership.familyId) throw notFound();
      await takeOut(client, membership.familyId, memberId);
      if (theirs.role !== 'child') await tellParental(client, [{ userId: memberId, notification: removedNotice(await this.person(client, ownerId), false) }]);
    });
    return { removed: true };
  }

  /**
   * A child asks their parent for something that is bought. Asking again for the same thing while the first ask
   * waits is the same ask, told once. Nothing is bought: the parent answers, and paying comes later.
   */
  async ask(childId: string, kind: PurchaseRequestKind, product: string, now: Date = new Date()): Promise<PurchaseRequest> {
    const made = await inTransaction(this.pool, async (client) => {
      const profile = await client.query<{ parent_id: string; name: string }>(
        `SELECT cp.parent_id, u.display_name AS name FROM child_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.user_id = $1`,
        [childId],
      );
      const row = profile.rows[0];
      if (!row) throw notFound();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO child_purchase_requests (child_id, parent_id, kind, product, created_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (child_id, kind, product) WHERE status = 'pending' DO NOTHING RETURNING id`,
        [childId, row.parent_id, kind, product, now],
      );
      if (inserted.rowCount) await tellParental(client, [{ userId: row.parent_id, notification: askedNotice({ id: childId, name: row.name }) }]);
      const found = await client.query<{ id: string }>(
        `SELECT id FROM child_purchase_requests WHERE child_id = $1 AND kind = $2 AND product = $3 AND status = 'pending'`,
        [childId, kind, product],
      );
      return found.rows[0]!.id;
    });
    const [request] = await this.requests('child', childId, made);
    return request!;
  }

  /** A child's own asks, or a parent's children's, the waiting ones first, then the last month's answers. */
  async requests(side: 'child' | 'parent', userId: string, only?: string): Promise<PurchaseRequest[]> {
    const r = await this.pool.query<{
      id: string;
      child_id: string;
      name: string;
      kind: PurchaseRequestKind;
      product: string;
      status: PurchaseRequestStatus;
      created_at: Date;
      decided_at: Date | null;
    }>(
      `SELECT r.id, r.child_id, u.display_name AS name, r.kind, r.product, r.status, r.created_at, r.decided_at
         FROM child_purchase_requests r JOIN users u ON u.id = r.child_id
        WHERE r.${side === 'child' ? 'child_id' : 'parent_id'} = $1
          AND ($2::uuid IS NULL OR r.id = $2::uuid)
          AND (r.status = 'pending' OR r.decided_at > now() - interval '30 days')
        ORDER BY r.status = 'pending' DESC, r.created_at DESC
        LIMIT 50`,
      [userId, only ?? null],
    );
    return r.rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      childName: row.name,
      kind: row.kind,
      product: row.product,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    }));
  }

  /** A parent answers a child's ask. Approving records the yes; buying it on the parent's phone is added later. */
  async decide(parentId: string, requestId: string, status: 'approved' | 'declined', now: Date = new Date()): Promise<PurchaseRequest> {
    // an ask already answered keeps its first answer
    await this.pool.query(
      `UPDATE child_purchase_requests SET status = $3, decided_at = $4 WHERE id = $1 AND parent_id = $2 AND status = 'pending'`,
      [requestId, parentId, status, now],
    );
    const [request] = await this.requests('parent', parentId, requestId);
    if (!request) throw notFound();
    return request;
  }
}

/** Takes someone out of a family, and, for an adult, the children whose profiles they made with them. */
async function takeOut(db: Executor, familyId: string, userId: string): Promise<void> {
  await db.query(
    `DELETE FROM family_members WHERE family_id = $1
        AND (user_id = $2 OR user_id IN (SELECT cp.user_id FROM child_profiles cp WHERE cp.parent_id = $2))`,
    [familyId, userId],
  );
}
