/**
 * Child profiles (shared/src/family.ts): a learner under 13 whose parent made the profile and consented for it. The
 * profile is a user row of kind 'child' with a name or nickname, a birth month, a preset avatar and nothing else of a
 * person's own; the parent's link and controls are parental controls' (parental/), so the daily limit, bedtime and
 * week view are the teen's, and every switch stays off. Making one writes the consent, and the parent's confirming
 * email must be on its way before the profile is kept.
 *
 * An unused profile is deleted after CHILD_IDLE_MONTHS, the parent warned a month before with a link to keep it; the
 * child's device records go DEVICE_RECORDS_DAYS after last use; and at 13 the parent is told the profile can become
 * the teen's own account, still linked to them.
 */
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import {
  CHILD_CONSENT_VERSION,
  MAX_CHILDREN_PER_PARENT,
  MAX_FAMILY_SIZE,
  MIN_CHILD_PROFILE_AGE,
  MIN_SIGNUP_AGE,
  ageInYears,
  hasOutgrownChildProfile,
  isChildAge,
  isPlausibleBirthMonth,
  localDay,
  safeTimeZone,
  type BirthMonth,
} from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { inTransaction, type Executor } from '../moderation/tx.js';
import { lockPersonFor } from '../limits/limits.js';
import type { JobQueue } from '../jobs/queue.js';
import { sendEmailJob } from '../jobs/email.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { avatarRequiresPremium, isValidAvatarKey } from '../cosmetics/avatars.js';
import { validateUsername, invalidUsername } from '../users/username.js';
import { hashPassword } from '../auth/service.js';
import { PASSWORD_ERROR_MESSAGE, validatePassword } from '../auth/password-policy.js';
import { breachCheckEnabled, isBreachedPassword } from '../auth/breached-password.js';
import { isDisposableEmail } from '../auth/disposable-domains.js';
import { tellParental } from '../parental/notices.js';
import { learningDays, mayBeParent, parentalAccount } from '../parental/service.js';
import type { GdprService } from '../gdpr/service.js';
import { avatarOf, childName, childrenFull, createFamilyIfNone, familyFull, familySize, membershipOf, notAdult, notFound } from './common.js';
import { childEmail, readChildLink, thirteenNotice } from './notices.js';

/** An unused child profile is deleted after this many months; its parent is warned a month before. */
export const CHILD_IDLE_MONTHS = 12;
/** A child's signed-in device is forgotten this long after it was last used. */
export const DEVICE_RECORDS_DAYS = 180;
/** The warning goes at least this long before the profile does, should a run of the upkeep be missed. */
const WARNING_LEAD_DAYS = 28;

/** A child as their parent's family page lists them. */
export interface ChildSummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  birthYear: number;
  birthMonth: number;
  age: number;
  /** in the parent's family, so on its board and its plan */
  inFamily: boolean;
  today: { minutes: number; lessons: number };
  /** 13 now: the profile can become the teen's own account */
  canConvert: boolean;
}

/** One phone a child is signed in on: their own, paired with a code, or the parent's, by a profile switch. */
export interface ChildDevice {
  id: string;
  onParentPhone: boolean;
  startedAt: string;
  lastUsedAt: string;
}

export interface ChildPage {
  child: ChildSummary;
  remindersAllowed: boolean;
  purchasesAllowed: boolean;
  consentedAt: string;
  consentVersion: string;
  devices: ChildDevice[];
}

export interface NewChild {
  name: string;
  birthYear: number;
  birthMonth: number;
  avatar: string;
}

export interface ChildDeps {
  jobs?: JobQueue | null;
  gdpr: Pick<GdprService, 'deleteChildProfile'>;
  config: Pick<AppConfig, 'APP_BASE_URL' | 'JWT_SECRET' | 'NODE_ENV' | 'PASSWORD_BREACH_CHECK'>;
  publicUrl?: PublicUrl;
  log?: { warn: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void };
}

const nameInvalid = (): AppError => new AppError('CHILD_NAME_INVALID', 422, 'a first name or nickname, in letters, without numbers or links');
const ageRefused = (birth: BirthMonth, now: Date): AppError =>
  new AppError('CHILD_AGE', 422, `a child profile is for children aged ${MIN_CHILD_PROFILE_AGE} to ${MIN_SIGNUP_AGE - 1}`, {
    reason: isPlausibleBirthMonth(birth, now) && ageInYears(birth, now) >= MIN_SIGNUP_AGE ? 'old' : 'young',
    min: MIN_CHILD_PROFILE_AGE,
    max: MIN_SIGNUP_AGE - 1,
  });
const avatarInvalid = (): AppError => new AppError('CHILD_AVATAR_INVALID', 422, 'choose one of the avatars Hevalo offers');
/** The confirming email could not be queued, so no profile was kept: consent needs it sent. */
const emailUnavailable = (): AppError => new AppError('FAMILY_EMAIL_UNAVAILABLE', 503, 'the confirmation email cannot be sent right now, so no profile was made: try again soon');

/** The letters a child's hidden username is drawn from; nobody sees it, and it must pass the username rule. */
const USERNAME_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** A child's username, never shown to anyone: `kid_` and ten random letters, checked like any username. */
export function childUsername(random: (max: number) => number = (max) => randomInt(max)): string {
  for (;;) {
    let tail = '';
    for (let i = 0; i < 10; i++) tail += USERNAME_ALPHABET[random(USERNAME_ALPHABET.length)];
    const check = validateUsername(`kid_${tail}`);
    if (check.ok) return check.value;
  }
}

interface ChildRow {
  id: string;
  username: string;
  display_name: string;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  birth_year: number;
  birth_month: number;
  in_family: boolean;
  time_zone: string | null;
  since: Date | null;
}

const CHILD_COLUMNS = `u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.birth_year, u.birth_month,
  EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = u.id) AS in_family, c.time_zone,
  (SELECT l.created_at FROM parental_links l WHERE l.teen_id = u.id AND l.parent_id = cp.parent_id AND l.ended_at IS NULL) AS since`;

export class ChildService {
  private readonly publicUrl: PublicUrl;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: ChildDeps,
  ) {
    this.publicUrl = deps.publicUrl ?? (() => null);
  }

  private async summary(row: ChildRow, now: Date): Promise<ChildSummary> {
    const zone = safeTimeZone(row.time_zone);
    const [today] = row.since ? await learningDays(this.pool, row.id, zone, localDay(now, zone), 1, row.since) : [];
    const birth = { year: row.birth_year, month: row.birth_month };
    return {
      userId: row.id,
      name: row.display_name,
      avatarUrl: avatarOf(row, this.publicUrl),
      avatarKey: row.selected_avatar_key,
      birthYear: row.birth_year,
      birthMonth: row.birth_month,
      age: ageInYears(birth, now),
      inFamily: row.in_family,
      today: { minutes: today?.minutes ?? 0, lessons: today?.lessons ?? 0 },
      canConvert: hasOutgrownChildProfile(birth, now),
    };
  }

  /** The child profiles a parent made, oldest first. */
  async summaries(parentId: string, now: Date = new Date()): Promise<ChildSummary[]> {
    const r = await this.pool.query<ChildRow>(
      `SELECT ${CHILD_COLUMNS}
         FROM child_profiles cp JOIN users u ON u.id = cp.user_id LEFT JOIN parental_controls c ON c.teen_id = u.id
        WHERE cp.parent_id = $1 ORDER BY cp.created_at`,
      [parentId],
    );
    return Promise.all(r.rows.map((row) => this.summary(row, now)));
  }

  /** One of the caller's children, or 404 for any child that is not theirs. */
  private async ownChild(db: Executor, parentId: string, childId: string): Promise<ChildRow & { reminders_allowed: boolean; purchases_allowed: boolean; consented_at: Date; consent_version: string }> {
    const r = await db.query<ChildRow & { reminders_allowed: boolean; purchases_allowed: boolean; consented_at: Date; consent_version: string }>(
      `SELECT ${CHILD_COLUMNS}, cp.reminders_allowed, cp.purchases_allowed, cp.consented_at, cp.consent_version
         FROM child_profiles cp JOIN users u ON u.id = cp.user_id LEFT JOIN parental_controls c ON c.teen_id = u.id
        WHERE cp.parent_id = $1 AND cp.user_id = $2`,
      [parentId, childId],
    );
    const row = r.rows[0];
    if (!row) throw notFound();
    return row;
  }

  /**
   * A parent makes a child's profile, consenting for it as they do. Under the parent's lock: they may still be a
   * parent, have fewer than MAX_CHILDREN_PER_PARENT children, and their family has room (one is started for them
   * when they have none). The child is linked to them as a supervised teen is, with every switch off, joins the
   * family, and the consent is written twice: on the profile, and in the log that outlives it. The confirming email
   * must be queued, or the profile is deleted again and nothing is kept.
   */
  async create(parentId: string, input: NewChild, now: Date = new Date()): Promise<ChildSummary> {
    const name = childName(input.name);
    if (!name) throw nameInvalid();
    const birth = { year: input.birthYear, month: input.birthMonth };
    if (!isChildAge(birth, now)) throw ageRefused(birth, now);
    if (!isValidAvatarKey(input.avatar) || avatarRequiresPremium(input.avatar)) throw avatarInvalid();
    const jobs = this.deps.jobs;
    if (!jobs) throw emailUnavailable();

    const made = await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', parentId);
      const parent = await parentalAccount(client, parentId);
      if (!parent || !mayBeParent(parent, now)) throw notAdult(parent);
      const children = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM child_profiles WHERE parent_id = $1`, [parentId]);
      if (children.rows[0]!.n >= MAX_CHILDREN_PER_PARENT) throw childrenFull();
      const familyId = (await membershipOf(client, parentId))?.familyId ?? (await createFamilyIfNone(client, parentId, now));
      if ((await familySize(client, familyId)) >= MAX_FAMILY_SIZE) throw familyFull();

      // A clash of the random username is retried within the transaction, behind a savepoint.
      let child: { id: string } | undefined;
      for (let attempt = 0; attempt < 5 && !child; attempt++) {
        await client.query('SAVEPOINT child_username');
        try {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO users (email, username, display_name, email_verified_at, locale, timezone, birth_year, birth_month,
                                selected_avatar_key, kind, leagues_enabled, profile_visibility)
             VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, 'child', false, 'nobody') RETURNING id`,
            [childUsername(), name, now, parent.locale, parent.timezone, birth.year, birth.month, input.avatar],
          );
          child = inserted.rows[0];
          await client.query('RELEASE SAVEPOINT child_username');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT child_username');
          if ((err as { code?: string }).code !== '23505') throw err;
        }
      }
      if (!child) throw new Error('could not find a free username for a child profile');
      await client.query(
        `INSERT INTO child_profiles (user_id, parent_id, consent_version, consented_at, created_at) VALUES ($1, $2, $3, $4, $4)`,
        [child.id, parentId, CHILD_CONSENT_VERSION, now],
      );
      await client.query(`INSERT INTO child_consent_log (parent_id, action, consent_version, at) VALUES ($1, 'created', $2, $3)`, [parentId, CHILD_CONSENT_VERSION, now]);
      await client.query(`INSERT INTO parental_links (parent_id, teen_id, created_at) VALUES ($1, $2, $3)`, [parentId, child.id, now]);
      await client.query(
        `INSERT INTO parental_controls (teen_id, chat, letters, posts, games, friends, purchases, time_zone, time_zone_changed_at, updated_at)
         VALUES ($1, false, false, false, false, false, false, $2, $3, $3)`,
        [child.id, safeTimeZone(parent.timezone), now],
      );
      await client.query(`INSERT INTO family_members (user_id, family_id, role, joined_at) VALUES ($1, $2, 'child', $3)`, [child.id, familyId, now]);
      return { childId: child.id, parent };
    });

    const email = childEmail(made.parent, 'family-child-added', { id: made.childId, name }, { base: this.deps.config.APP_BASE_URL, secret: this.deps.config.JWT_SECRET, now });
    try {
      if (!email) throw new Error('the parent has no confirmed address');
      await jobs.enqueue(sendEmailJob, email);
    } catch (err) {
      this.deps.log?.warn({ err }, 'a child profile’s confirmation email could not be queued, so the profile was deleted again');
      await this.deps.gdpr.deleteChildProfile(made.childId);
      throw emailUnavailable();
    }
    const [summary] = (await this.summaries(parentId, now)).filter((c) => c.userId === made.childId);
    return summary!;
  }

  /** What a parent sees of one child beyond the week: the profile, the two switches, the consent, and the devices. */
  async page(parentId: string, childId: string, now: Date = new Date()): Promise<ChildPage> {
    const row = await this.ownChild(this.pool, parentId, childId);
    return {
      child: await this.summary(row, now),
      remindersAllowed: row.reminders_allowed,
      purchasesAllowed: row.purchases_allowed,
      consentedAt: row.consented_at.toISOString(),
      consentVersion: row.consent_version,
      devices: await childDevices(this.pool, childId),
    };
  }

  /**
   * A parent changes a child's name, avatar or reminders. Reminders turned off take the child's phones off
   * notifications at once, since a phone is only told while reminders are allowed.
   */
  async update(parentId: string, childId: string, patch: { name?: string; avatar?: string; remindersAllowed?: boolean }, now: Date = new Date()): Promise<ChildPage> {
    await inTransaction(this.pool, async (client) => {
      await this.ownChild(client, parentId, childId);
      if (patch.name !== undefined) {
        const name = childName(patch.name);
        if (!name) throw nameInvalid();
        await client.query(`UPDATE users SET display_name = $2 WHERE id = $1`, [childId, name]);
      }
      if (patch.avatar !== undefined) {
        if (!isValidAvatarKey(patch.avatar) || avatarRequiresPremium(patch.avatar)) throw avatarInvalid();
        await client.query(`UPDATE users SET selected_avatar_key = $2 WHERE id = $1`, [childId, patch.avatar]);
      }
      if (patch.remindersAllowed !== undefined) {
        await client.query(`UPDATE child_profiles SET reminders_allowed = $2 WHERE user_id = $1`, [childId, patch.remindersAllowed]);
        if (!patch.remindersAllowed) await client.query(`DELETE FROM device_tokens WHERE user_id = $1`, [childId]);
      }
    });
    return this.page(parentId, childId, now);
  }

  /** A parent deletes a child's profile now, with everything in it (gdpr/service.ts `deleteChildProfile`). */
  async delete(parentId: string, childId: string): Promise<{ deleted: true }> {
    await this.ownChild(this.pool, parentId, childId);
    await this.deps.gdpr.deleteChildProfile(childId);
    return { deleted: true };
  }

  /** Whether `childId` is one of `parentId`'s children, for the routes that act on the child's own account (the export). */
  async assertParent(parentId: string, childId: string): Promise<void> {
    await this.ownChild(this.pool, parentId, childId);
  }

  /**
   * A parent turns a child of 13 or more into the teen's own account, with the address and password they set
   * together: the same row, learning and parental link, now a teen's. The child's sessions end, the teen signs in with
   * the new address, confirms it, and accepts the terms themselves. The switches stay off until the parent opens them.
   */
  async convert(parentId: string, childId: string, input: { email: string; password: string; username: string }, now: Date = new Date()): Promise<{ converted: true; username: string }> {
    const row = await this.ownChild(this.pool, parentId, childId);
    if (!hasOutgrownChildProfile({ year: row.birth_year, month: row.birth_month }, now)) {
      throw new AppError('CHILD_NOT_THIRTEEN', 409, 'a child profile becomes an account of its own at 13');
    }
    const username = validateUsername(input.username);
    if (!username.ok) throw invalidUsername(username);
    const policy = validatePassword(input.password);
    if (!policy.ok) throw new AppError('WEAK_PASSWORD', 400, PASSWORD_ERROR_MESSAGE[policy.reason], { reason: policy.reason });
    if (breachCheckEnabled(this.deps.config) && (await isBreachedPassword(input.password))) {
      throw new AppError('PASSWORD_BREACHED', 400, 'this password has appeared in a data breach — choose a different one', { reason: 'breached' });
    }
    if (isDisposableEmail(input.email)) throw new AppError('EMAIL_REFUSED', 422, 'use an address that lasts: a throwaway address cannot hold an account');
    const hash = await hashPassword(input.password);
    await inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'family', parentId);
      await this.ownChild(client, parentId, childId);
      try {
        await client.query('SAVEPOINT convert');
        await client.query(
          `UPDATE users SET kind = 'person', email = $2, username = $3, password_hash = $4, email_verified_at = NULL,
                  consent_version = NULL, consented_at = NULL, token_version = token_version + 1
            WHERE id = $1`,
          [childId, input.email, username.value, hash],
        );
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT convert');
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === '23505' && pgErr.constraint?.includes('email')) throw new AppError('EMAIL_TAKEN', 409, 'that address already has an account');
        if (pgErr.code === '23505') throw new AppError('USERNAME_TAKEN', 409, 'that username is taken');
        throw err;
      }
      await client.query(`DELETE FROM child_purchase_requests WHERE child_id = $1`, [childId]);
      await client.query(`DELETE FROM child_pairing_codes WHERE child_id = $1`, [childId]);
      await client.query(`DELETE FROM child_profiles WHERE user_id = $1`, [childId]);
      await client.query(`UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, [childId, now]);
      await client.query(`UPDATE family_members SET role = 'teen' WHERE user_id = $1`, [childId]);
    });
    return { converted: true, username: username.value };
  }

  /**
   * What a link in a parent's email does (notices.ts): delete the profile, or keep one that was going for being
   * unused. A link for a profile already gone says so; any other token is refused.
   */
  async byLink(token: string, now: Date = new Date()): Promise<{ done: 'removed' | 'kept' | 'gone' }> {
    const link = readChildLink(this.deps.config.JWT_SECRET, token, now);
    if (!link) throw new AppError('FAMILY_LINK_INVALID', 404, 'this link doesn’t work any more: open Hevalo on your phone, then Settings, then Family');
    if (link.action === 'remove') return { done: (await this.deps.gdpr.deleteChildProfile(link.childId)) ? 'removed' : 'gone' };
    const kept = await this.pool.query(`UPDATE child_profiles SET kept_at = $2, idle_warned_at = NULL WHERE user_id = $1`, [link.childId, now]);
    return { done: kept.rowCount ? 'kept' : 'gone' };
  }

  /**
   * The daily upkeep: a parent told once when their child turns 13; an unused profile's parent warned a month before
   * it goes, and the profile deleted once its year is out and the warning has had its time; a child's device records
   * past DEVICE_RECORDS_DAYS, the consent log past its years, and codes that can no longer work, gone. A profile is
   * used when the child's phone renews its session, which it does every few minutes while open.
   */
  async upkeep(now: Date = new Date()): Promise<{ told: number; warned: number; deleted: number }> {
    const thirteen = await this.pool.query<{ user_id: string; parent_id: string; name: string }>(
      `UPDATE child_profiles cp SET thirteen_noticed_at = $1
         FROM users u
        WHERE u.id = cp.user_id AND cp.thirteen_noticed_at IS NULL
          AND extract(year FROM $1::timestamptz AT TIME ZONE 'UTC')::int - u.birth_year
              - CASE WHEN extract(month FROM $1::timestamptz AT TIME ZONE 'UTC')::int <= u.birth_month THEN 1 ELSE 0 END >= $2
        RETURNING cp.user_id, cp.parent_id, u.display_name AS name`,
      [now, MIN_SIGNUP_AGE],
    );
    await tellParental(this.pool, thirteen.rows.map((r) => ({ userId: r.parent_id, notification: thirteenNotice({ id: r.user_id, name: r.name }) })));

    const used = `GREATEST(cp.created_at, COALESCE(cp.kept_at, cp.created_at),
                           COALESCE((SELECT max(rt.created_at) FROM refresh_tokens rt WHERE rt.user_id = cp.user_id), cp.created_at))`;
    let warned = 0;
    if (this.deps.jobs) {
      const due = await this.pool.query<{ user_id: string; name: string; parent_id: string }>(
        `SELECT cp.user_id, u.display_name AS name, cp.parent_id
           FROM child_profiles cp JOIN users u ON u.id = cp.user_id
          WHERE ${used} < $1::timestamptz - make_interval(months => $2)
            AND (cp.idle_warned_at IS NULL OR cp.idle_warned_at < ${used})
          LIMIT 200`,
        [now, CHILD_IDLE_MONTHS - 1],
      );
      for (const row of due.rows) {
        const parent = await parentalAccount(this.pool, row.parent_id);
        const email = parent
          ? childEmail(parent, 'family-child-unused', { id: row.user_id, name: row.name }, { base: this.deps.config.APP_BASE_URL, secret: this.deps.config.JWT_SECRET, now })
          : null;
        if (!email) continue;
        const sent = await this.deps.jobs.enqueue(sendEmailJob, email).then(
          () => true,
          (err: unknown) => {
            this.deps.log?.warn({ err }, 'an unused child profile’s warning could not be queued');
            return false;
          },
        );
        if (!sent) continue;
        await this.pool.query(`UPDATE child_profiles SET idle_warned_at = $2 WHERE user_id = $1`, [row.user_id, now]);
        warned++;
      }
    }

    // Only a profile whose parent was warned goes: without a warning sent, nothing is deleted for being unused.
    const lapsed = await this.pool.query<{ user_id: string }>(
      `SELECT cp.user_id FROM child_profiles cp
        WHERE ${used} < $1::timestamptz - make_interval(months => $2)
          AND cp.idle_warned_at IS NOT NULL AND cp.idle_warned_at >= ${used}
          AND cp.idle_warned_at <= $1::timestamptz - make_interval(days => $3)
        LIMIT 200`,
      [now, CHILD_IDLE_MONTHS, WARNING_LEAD_DAYS],
    );
    let deleted = 0;
    for (const row of lapsed.rows) if (await this.deps.gdpr.deleteChildProfile(row.user_id)) deleted++;

    await this.pool.query(
      `DELETE FROM refresh_tokens rt USING users u
        WHERE u.id = rt.user_id AND u.kind = 'child' AND rt.created_at < $1::timestamptz - make_interval(days => $2)`,
      [now, DEVICE_RECORDS_DAYS],
    );
    await this.pool.query(`DELETE FROM child_consent_log WHERE at < $1::timestamptz - make_interval(years => $2)`, [now, 3]);
    await this.pool.query(`DELETE FROM child_pairing_codes WHERE expires_at <= $1`, [now]);
    await this.pool.query(`DELETE FROM family_invites WHERE expires_at <= $1`, [now]);
    return { told: thirteen.rowCount ?? 0, warned, deleted };
  }
}

/** The phones a child is signed in on, each listed once with its sessions together, as an account's own devices are. */
export async function childDevices(db: Executor, childId: string): Promise<ChildDevice[]> {
  const r = await db.query<{ id: string; on_parent_phone: boolean; started_at: Date; last_used_at: Date }>(
    `WITH live AS (
       SELECT family_id, device_hash, return_to, session_started_at, created_at FROM refresh_tokens
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     )
     SELECT (array_agg(family_id ORDER BY created_at DESC))[1] AS id, bool_or(return_to IS NOT NULL) AS on_parent_phone,
            min(session_started_at) AS started_at, max(created_at) AS last_used_at
       FROM live GROUP BY coalesce(device_hash, family_id::text) ORDER BY max(created_at) DESC`,
    [childId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    onParentPhone: row.on_parent_phone,
    startedAt: row.started_at.toISOString(),
    lastUsedAt: row.last_used_at.toISOString(),
  }));
}

/**
 * A child's own view of who looks after them, for GET /me: their parent's name, whether this session is the one
 * opened on the parent's phone (which the PIN gives back), and whether the parent allows learning reminders.
 */
export async function childSessionOf(
  db: Executor,
  childId: string,
  familyId: string | null,
): Promise<{ parentName: string; returnable: boolean; remindersAllowed: boolean } | null> {
  const r = await db.query<{ parent_name: string; returnable: boolean; reminders_allowed: boolean }>(
    `SELECT COALESCE(NULLIF(trim(p.display_name), ''), p.username) AS parent_name, cp.reminders_allowed,
            EXISTS (SELECT 1 FROM refresh_tokens rt
                     WHERE rt.user_id = $1 AND rt.family_id::text = $2 AND rt.return_to IS NOT NULL AND rt.revoked_at IS NULL) AS returnable
       FROM child_profiles cp JOIN users p ON p.id = cp.parent_id WHERE cp.user_id = $1`,
    [childId, familyId ?? ''],
  );
  const row = r.rows[0];
  return row ? { parentName: row.parent_name, returnable: row.returnable, remindersAllowed: row.reminders_allowed } : null;
}

