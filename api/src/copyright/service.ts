import type pg from 'pg';
import {
  APPEAL_WINDOW_DAYS,
  COPYRIGHT_NOTICES_PER_HOUR,
  COPYRIGHT_STRIKES_FOR_TERMINATION,
  COPYRIGHT_STRIKE_WINDOW_DAYS,
  COUNTER_NOTICE_WINDOW_DAYS,
  MAX_APPEAL_LEN,
  PROVIDER,
  cleanCopyrightText,
  copyrightNoticeProblems,
  copyrightReference,
  counterNoticeProblems,
  parseCopyrightTarget,
  restoreNotBefore,
  type CopyrightCaseInfo,
  type CopyrightNoticeReceipt,
  type CopyrightNoticeRequest,
  type CopyrightNoticeStatus,
  type CopyrightNoticeView,
  type CopyrightNotifierRole,
  type CopyrightStrikes,
  type CopyrightTargetRef,
  type CopyrightTargetType,
  type CounterNoticeReceipt,
  type CounterNoticeRequest,
  type MyCopyrightNotice,
} from '@kurda/shared';
import { emailLocaleFor, type EmailLocale } from '../email/templates.js';
import { AppError } from '../plugins/errors.js';
import { isNotKnownAdultUser, minorSql } from '../users/age.js';
import { resolveTarget } from '../moderation/evidence.js';
import { networkHash, userHash } from '../moderation/pseudonym.js';
import { OPEN_CASE_PREDICATE } from '../moderation/reports-service.js';
import { inTransaction, type Executor } from '../moderation/tx.js';

/**
 * Copyright notices from the public /copyright page, counter-notices, and
 * strikes (contract-3 §C; the shapes are in @kurda/shared copyright.ts).
 *
 * A notice becomes a moderation case the way a report does — the same queue,
 * the same case view, the same decision with its statement of reasons to the
 * uploader — under the case source `copyright`, queued at P1 because a host
 * that is told is expected to act within a couple of working days. Several
 * notices about one post join its one open case.
 *
 * The form never says whether the link it was given leads anywhere: the
 * answer is the same receipt either way, so it cannot be used to find out
 * whether a draft, a removed post or a friends-only post exists. A link that
 * matches nothing still opens a case, for an admin to look into by hand.
 *
 * Email is the only way to reach most notifiers, so the receipt goes at once
 * and the decision goes from a sweep that claims each notice before sending
 * (at most once each; a failed send is released for the next round).
 */

export type CopyrightTemplate =
  | 'copyright-received'
  | 'copyright-removed'
  | 'copyright-upheld'
  | 'copyright-kept'
  | 'copyright-counter-notice';

/** The email that tells a notifier the decision, by what the decision did. */
const OUTCOME_TEMPLATE: Readonly<Record<Exclude<CopyrightNoticeStatus, 'received'>, CopyrightTemplate>> = {
  actioned: 'copyright-removed',
  // answered by a counter-notice, but taken down all the same
  countered: 'copyright-removed',
  upheld: 'copyright-upheld',
  rejected: 'copyright-kept',
};

export interface CopyrightMailer {
  send(to: string, template: CopyrightTemplate, vars: Record<string, string>, locale: EmailLocale): Promise<void>;
}

export interface CopyrightOptions {
  mailer: CopyrightMailer;
  /** where links in the emails point (the web app's origin) */
  webBaseUrl?: string;
  log?: { warn: (obj: unknown, msg: string) => void };
}

interface NoticeRow {
  id: string;
  case_id: string | null;
  status: CopyrightNoticeStatus;
  target_type: CopyrightTargetType | null;
  target_id: string | null;
  target_found: boolean;
  subject_user_id: string | null;
  notifier_name: string;
  notifier_email: string;
  notifier_address: string;
  notifier_phone: string | null;
  notifier_role: CopyrightNotifierRole;
  rights_holder: string | null;
  work: string;
  work_url: string | null;
  content_url: string;
  explanation: string;
  good_faith: boolean;
  accurate: boolean;
  signature: string;
  locale: string;
  receipt_sent_at: Date | null;
  outcome_sent_at: Date | null;
  created_at: Date;
}

interface CounterRow {
  id: string;
  notice_id: string;
  user_id: string | null;
  name: string;
  address: string;
  phone: string | null;
  email: string;
  statement: string;
  good_faith: boolean;
  consent: boolean;
  signature: string;
  restore_not_before: Date;
  forwarded_at: Date | null;
  created_at: Date;
}

const TARGET_WORDS: Readonly<Record<CopyrightTargetType, string>> = {
  library_post: 'written post',
  image_post: 'picture post',
  user: 'profile',
};

/** The one-line summary the queue shows. Built in code from values that may be missing, so never empty. */
export function copyrightCaseSummary(count: number, target: CopyrightTargetType | null, username: string | null): string {
  const what = count === 1 ? '1 copyright notice' : `${count} copyright notices`;
  const where = target ? TARGET_WORDS[target] : 'a link that matched nothing';
  return `${what} · ${where}${username ? ` by @${username}` : ''}`;
}

const optional = (value: unknown): string | null => cleanCopyrightText(value) || null;

/**
 * A person's confirmed copyright strikes: copyright decisions against them in
 * the window that still stand — an unrevoked, confirmed sanction under the
 * copyright rule, counted once per case. An overturned appeal or a restored
 * post revokes the sanction, and the strike goes with it.
 */
export async function copyrightStrikes(db: Executor, userId: string, now: Date = new Date()): Promise<CopyrightStrikes> {
  const r = await db.query<{ ref: string }>(
    `SELECT COALESCE(case_id::text, id::text) AS ref
       FROM sanctions
      WHERE user_id = $1 AND policy = 'copyright' AND revoked_at IS NULL AND NOT pending_approval
        AND created_at > $2::timestamptz - make_interval(days => $3::int)
      GROUP BY 1
      ORDER BY max(created_at) DESC`,
    [userId, now, COPYRIGHT_STRIKE_WINDOW_DAYS],
  );
  const count = r.rows.length;
  return {
    count,
    windowDays: COPYRIGHT_STRIKE_WINDOW_DAYS,
    threshold: COPYRIGHT_STRIKES_FOR_TERMINATION,
    terminationSuggested: count >= COPYRIGHT_STRIKES_FOR_TERMINATION,
    caseIds: r.rows.map((x) => x.ref),
  };
}

function toCounterView(c: CounterRow): NonNullable<CopyrightNoticeView['counterNotice']> {
  return {
    id: c.id,
    userId: c.user_id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    email: c.email,
    statement: c.statement,
    goodFaith: c.good_faith,
    consent: c.consent,
    signature: c.signature,
    createdAt: c.created_at.toISOString(),
    restoreNotBefore: c.restore_not_before.toISOString(),
    forwardedAt: c.forwarded_at?.toISOString() ?? null,
  };
}

function toNoticeView(n: NoticeRow, counter: CounterRow | undefined): CopyrightNoticeView {
  return {
    id: n.id,
    reference: copyrightReference(n.id),
    status: n.status,
    receivedAt: n.created_at.toISOString(),
    notifier: {
      name: n.notifier_name,
      email: n.notifier_email,
      address: n.notifier_address,
      phone: n.notifier_phone,
      role: n.notifier_role,
      rightsHolder: n.rights_holder,
      signature: n.signature,
      locale: n.locale,
    },
    work: n.work,
    workUrl: n.work_url,
    contentUrl: n.content_url,
    target: n.target_type && n.target_id ? { type: n.target_type, id: n.target_id } : null,
    targetFound: n.target_found,
    explanation: n.explanation,
    goodFaith: n.good_faith,
    accurate: n.accurate,
    receiptSentAt: n.receipt_sent_at?.toISOString() ?? null,
    outcomeSentAt: n.outcome_sent_at?.toISOString() ?? null,
    counterNotice: counter ? toCounterView(counter) : null,
  };
}

/**
 * What the case view shows about copyright: the notices behind the case and
 * the reported person's strikes. Null for a case that is not about copyright.
 */
export async function copyrightCaseInfo(
  db: Executor,
  c: { id: string; source: string; category: string | null; policy: string | null; subject_user_id: string | null },
): Promise<CopyrightCaseInfo | null> {
  if (c.source !== 'copyright' && c.category !== 'copyright' && c.policy !== 'copyright') return null;
  const notices = await db.query<NoticeRow>(`SELECT * FROM copyright_notices WHERE case_id = $1 ORDER BY created_at`, [c.id]);
  const counters = notices.rows.length
    ? await db.query<CounterRow>(`SELECT * FROM copyright_counter_notices WHERE notice_id = ANY($1::uuid[])`, [
        notices.rows.map((n) => n.id),
      ])
    : { rows: [] as CounterRow[] };
  const byNotice = new Map(counters.rows.map((x) => [x.notice_id, x]));
  return {
    notices: notices.rows.map((n) => toNoticeView(n, byNotice.get(n.id))),
    strikes: c.subject_user_id ? await copyrightStrikes(db, c.subject_user_id) : null,
  };
}

export class CopyrightService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly opts: CopyrightOptions,
  ) {}

  private contentLink(target: CopyrightTargetRef | null, typed: string): string {
    if (!target || !this.opts.webBaseUrl) return typed;
    const base = this.opts.webBaseUrl.replace(/\/$/, '');
    const path = target.type === 'library_post' ? 'library' : target.type === 'image_post' ? 'dimen' : 'users';
    return `${base}/app/${path}/${target.id}`;
  }

  /**
   * Take a notice: check it, find what it points at, open or join that
   * target's case, and email the receipt. Answers the same receipt whatever
   * the link turned out to be.
   */
  async fileNotice(input: Partial<Record<keyof CopyrightNoticeRequest, unknown>>, ip: string): Promise<CopyrightNoticeReceipt> {
    const problems = copyrightNoticeProblems(input);
    if (problems.length > 0) {
      throw new AppError('INVALID_NOTICE', 422, 'some of the notice is missing or not valid', { problems });
    }
    const ipHash = networkHash(ip);
    // the route's limiter is the first brake; this one holds if its store is down
    const recent = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM copyright_notices WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
      [ipHash],
    );
    if ((recent.rows[0]?.n ?? 0) >= COPYRIGHT_NOTICES_PER_HOUR) {
      throw new AppError('RATE_LIMITED', 429, 'too many notices from this address — try again in an hour', { retryAfterSec: 3600 });
    }

    const now = new Date();
    const typedLink = cleanCopyrightText(input.contentUrl);
    const target = parseCopyrightTarget(typedLink);
    const resolved = target ? await resolveTarget(this.pool, target.type, target.id, { reporterId: null, now }) : null;
    const found = resolved && !('refused' in resolved) ? resolved : null;
    const role = input.role as CopyrightNotifierRole;
    const locale = typeof input.locale === 'string' && input.locale.length <= 10 ? input.locale : 'en';
    const email = cleanCopyrightText(input.email);

    const notice = await inTransaction(this.pool, async (client) => {
      const inserted = await client.query<NoticeRow>(
        `INSERT INTO copyright_notices
           (target_type, target_id, target_found, subject_user_id, notifier_name, notifier_email, notifier_address,
            notifier_phone, notifier_role, rights_holder, work, work_url, content_url, explanation, good_faith, accurate,
            signature, locale, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, true, $15, $16, $17)
         RETURNING *`,
        [
          target?.type ?? null,
          target?.id ?? null,
          found !== null,
          found?.subjectUserId ?? null,
          cleanCopyrightText(input.name),
          email,
          cleanCopyrightText(input.address),
          optional(input.phone),
          role,
          role === 'authorised' ? optional(input.rightsHolder) : null,
          cleanCopyrightText(input.work),
          optional(input.workUrl),
          typedLink,
          cleanCopyrightText(input.explanation),
          cleanCopyrightText(input.signature),
          locale,
          ipHash,
        ],
      );
      const row = inserted.rows[0]!;
      const caseId = await this.attachToCase(client, row, found?.evidence ?? null, now);
      if (found && found.evidence.mediaKeys.length > 0) {
        // kept from cleanup while the evidence is, like a report's
        await client.query(`UPDATE media_uploads SET preserve_evidence = true WHERE key = ANY($1::text[])`, [found.evidence.mediaKeys]);
      }
      return { ...row, case_id: caseId };
    });

    const reference = copyrightReference(notice.id);
    try {
      await this.opts.mailer.send(
        email,
        'copyright-received',
        { reference, link: this.contentLink(target, typedLink), contact: PROVIDER.copyrightEmail },
        emailLocaleFor(locale),
      );
      await this.pool.query(`UPDATE copyright_notices SET receipt_sent_at = now() WHERE id = $1`, [notice.id]);
    } catch (err) {
      // the notice stands either way; the admin sees that no receipt went
      this.opts.log?.warn({ err, noticeId: notice.id }, 'copyright notice receipt failed to send');
    }
    return { reference, receivedAt: notice.created_at.toISOString() };
  }

  /**
   * Open the target's copyright case, or join the open one, and bring its
   * counts and summary up to date. A notice whose link matched nothing gets a
   * case of its own.
   */
  private async attachToCase(client: pg.PoolClient, n: NoticeRow, evidence: object | null, at: Date): Promise<string> {
    const ref = n.target_found && n.target_type ? `${n.target_type}:${n.target_id}` : `notice:${n.id}`;
    const find = () =>
      client.query<{ id: string }>(
        `SELECT id FROM moderation_cases WHERE source = 'copyright' AND source_ref = $1 AND ${OPEN_CASE_PREDICATE} FOR UPDATE`,
        [ref],
      );
    let caseId = (await find()).rows[0]?.id;
    if (!caseId) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO moderation_cases (source, source_ref, subject_user_id, severity, summary, evidence, source_created_at,
                                       target_type, target_id, first_reported_at, last_reported_at, priority, category)
         VALUES ('copyright', $1, $2, 80, 'New copyright notice', $3::jsonb, $4, $5, $6, $4, $4, 1, 'copyright')
         ON CONFLICT (source, source_ref) WHERE ${OPEN_CASE_PREDICATE} DO NOTHING
         RETURNING id`,
        [ref, n.subject_user_id, JSON.stringify(evidence ?? { contentUrl: n.content_url }), at, n.target_found ? n.target_type : null,
          n.target_found ? n.target_id : null],
      );
      caseId = created.rows[0]?.id ?? (await find()).rows[0]?.id;
    }
    if (!caseId) throw new Error(`no open copyright case could be found or opened for ${ref}`);
    await client.query(`UPDATE copyright_notices SET case_id = $2 WHERE id = $1`, [n.id, caseId]);

    const agg = await client.query<{ n: number; notifiers: number; username: string | null; minor: boolean | null }>(
      `SELECT count(*)::int AS n, count(DISTINCT lower(cn.notifier_email))::int AS notifiers,
              (SELECT u.username FROM users u WHERE u.id = c.subject_user_id) AS username,
              (SELECT ${minorSql('u')} FROM users u WHERE u.id = c.subject_user_id) AS minor
         FROM moderation_cases c JOIN copyright_notices cn ON cn.case_id = c.id
        WHERE c.id = $1
        GROUP BY c.id`,
      [caseId],
    );
    const a = agg.rows[0]!;
    await client.query(
      `UPDATE moderation_cases SET report_count = $2, reporter_count = $3, last_reported_at = $4, summary = $5,
              minor_involved = minor_involved OR $6, updated_at = now()
        WHERE id = $1`,
      [caseId, a.n, a.notifiers, at, copyrightCaseSummary(a.n, n.target_found ? n.target_type : null, a.username), a.minor === true],
    );
    return caseId;
  }

  /** `GET /me/copyright/notices`: the notices that took something of yours down. */
  async myNotices(userId: string): Promise<MyCopyrightNotice[]> {
    const r = await this.pool.query<NoticeRow & { resolved_at: Date | null; countered_at: Date | null }>(
      `SELECT n.*, c.resolved_at, cn.created_at AS countered_at
         FROM copyright_notices n
         JOIN moderation_cases c ON c.id = n.case_id
         LEFT JOIN copyright_counter_notices cn ON cn.notice_id = n.id
        WHERE n.subject_user_id = $1 AND n.status IN ('actioned','countered')
        ORDER BY n.created_at DESC
        LIMIT 100`,
      [userId],
    );
    const now = Date.now();
    return r.rows.map((n) => {
      const deadline = n.resolved_at ? new Date(n.resolved_at.getTime() + COUNTER_NOTICE_WINDOW_DAYS * 86_400_000) : null;
      return {
        id: n.id,
        reference: copyrightReference(n.id),
        claimant: n.rights_holder ?? n.notifier_name,
        work: n.work,
        target: n.target_found && n.target_type && n.target_id ? { type: n.target_type, id: n.target_id } : null,
        decidedAt: n.resolved_at?.toISOString() ?? null,
        // the query lists only these two
        status: n.status === 'countered' ? 'countered' : 'actioned',
        counterNotice: n.countered_at ? { createdAt: n.countered_at.toISOString() } : null,
        canCounter: n.status === 'actioned' && !n.countered_at && deadline !== null && deadline.getTime() > now,
        counterDeadline: deadline?.toISOString() ?? null,
      };
    });
  }

  /**
   * A counter-notice from the person whose post a notice took down.
   *
   * It is recorded on the notice, shown in the case view, and becomes a review
   * request on the removal (the admin's Appeals page has it, and overturning it
   * puts the post back and takes the strike away). The notifier gets a copy,
   * as the DMCA asks, with the earliest day the post may come back.
   */
  async counter(userId: string, noticeId: string, input: Partial<Record<keyof CounterNoticeRequest, unknown>>): Promise<CounterNoticeReceipt> {
    // The copy the DMCA asks us to forward carries the sender's name, home address
    // and phone to the notifier — anyone who filled in the public form, unverified.
    // A child's are never sent there: a parent or guardian answers by email instead,
    // and the removal's review request (Account standing) needs no address at all.
    // Checked first, so nothing a minor typed is stored; an account with no birth
    // month on record is held back the same way.
    if (await isNotKnownAdultUser(this.pool, userId)) {
      throw new AppError('COUNTER_NOTICE_ADULT_REQUIRED', 403, 'a counter-notice from an account under 18 is sent by a parent or guardian, by email');
    }
    const problems = counterNoticeProblems(input);
    if (problems.length > 0) {
      throw new AppError('INVALID_COUNTER_NOTICE', 422, 'some of the counter-notice is missing or not valid', { problems });
    }
    const now = new Date();
    const restore = restoreNotBefore(now);
    const done = await inTransaction(this.pool, async (client) => {
      const r = await client.query<NoticeRow & { resolved_at: Date | null; subject: string | null }>(
        `SELECT n.*, c.resolved_at, c.subject_user_id AS subject
           FROM copyright_notices n JOIN moderation_cases c ON c.id = n.case_id
          WHERE n.id = $1 AND n.subject_user_id = $2
          FOR UPDATE OF n`,
        [noticeId, userId],
      );
      const n = r.rows[0];
      // not yours, not decided, or decided in your favour: nothing to answer
      if (!n || (n.status !== 'actioned' && n.status !== 'countered')) {
        throw new AppError('NOT_FOUND', 404, 'there is no removal on that notice to answer');
      }
      if (n.status === 'countered') throw new AppError('ALREADY_COUNTERED', 409, 'you have already answered this notice');
      if (!n.resolved_at || n.resolved_at.getTime() + COUNTER_NOTICE_WINDOW_DAYS * 86_400_000 < now.getTime()) {
        throw new AppError('COUNTER_WINDOW_CLOSED', 409, 'the six months to answer this notice have passed');
      }

      const statement = cleanCopyrightText(input.statement);
      // the removal's own review request, unless one is already open or decided
      const removal = await client.query<{ id: string; created_at: Date }>(
        `SELECT s.id, s.created_at FROM sanctions s
          WHERE s.case_id = $1 AND s.user_id = $2 AND s.kind = 'content_removal' AND s.revoked_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM appeals a WHERE a.sanction_id = s.id)
          ORDER BY s.created_at LIMIT 1`,
        [n.case_id, userId],
      );
      let appealId: string | null = null;
      const s = removal.rows[0];
      if (s && s.created_at.getTime() + APPEAL_WINDOW_DAYS * 86_400_000 > now.getTime()) {
        const text = [...`Copyright counter-notice: ${statement}`].slice(0, MAX_APPEAL_LEN).join('');
        const a = await client.query<{ id: string }>(
          `INSERT INTO appeals (sanction_id, user_id, user_hash, text) VALUES ($1, $2, $3, $4) RETURNING id`,
          [s.id, userId, userHash(userId), text],
        );
        appealId = a.rows[0]!.id;
      }

      const inserted = await client.query<CounterRow>(
        `INSERT INTO copyright_counter_notices
           (notice_id, user_id, name, address, phone, email, statement, good_faith, consent, signature, appeal_id, restore_not_before)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, $8, $9, $10)
         RETURNING *`,
        [
          n.id,
          userId,
          cleanCopyrightText(input.name),
          cleanCopyrightText(input.address),
          optional(input.phone),
          cleanCopyrightText(input.email),
          statement,
          cleanCopyrightText(input.signature),
          appealId,
          restore,
        ],
      );
      await client.query(`UPDATE copyright_notices SET status = 'countered' WHERE id = $1`, [n.id]);
      // a note on the case from nobody in particular: what came in, and what the admin can do next
      await client.query(`INSERT INTO moderation_case_notes (case_id, author_id, body) VALUES ($1, NULL, $2)`, [
        n.case_id,
        `Counter-notice to ${copyrightReference(n.id)} from the uploader (a copy went to the notifier). ` +
          `Unless the notifier reports a court action, the post may be restored from ${restore.toISOString().slice(0, 10)}` +
          (appealId ? ' by overturning the review request on the removal (Appeals).' : '.'),
      ]);
      return { notice: n, counter: inserted.rows[0]! };
    });

    // the copy the DMCA asks to be forwarded; the record stands if it does not go
    const c = done.counter;
    try {
      await this.opts.mailer.send(
        done.notice.notifier_email,
        'copyright-counter-notice',
        {
          reference: copyrightReference(done.notice.id),
          name: c.name,
          address: c.address,
          phone: c.phone ?? '—',
          email: c.email,
          statement: c.statement,
          signature: c.signature,
          restoreDate: c.restore_not_before.toISOString().slice(0, 10),
          contact: PROVIDER.copyrightEmail,
        },
        emailLocaleFor(done.notice.locale),
      );
      await this.pool.query(`UPDATE copyright_counter_notices SET forwarded_at = now() WHERE id = $1`, [c.id]);
    } catch (err) {
      this.opts.log?.warn({ err, counterNoticeId: c.id }, 'forwarding a counter-notice failed');
    }
    return { createdAt: c.created_at.toISOString(), restoreNotBefore: c.restore_not_before.toISOString() };
  }

  /**
   * Email notifiers the decision on their notice (DSA Art. 16(5)). Each notice
   * is claimed before its email goes, so it goes once; one that fails is
   * released for the next round. Returns how many went.
   */
  async sendOutcomes(limit = 50): Promise<number> {
    const due = await this.pool.query<NoticeRow>(
      `UPDATE copyright_notices SET outcome_sent_at = now()
        WHERE id IN (SELECT id FROM copyright_notices
                      WHERE outcome_sent_at IS NULL AND status <> 'received'
                      ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [limit],
    );
    let sent = 0;
    for (const n of due.rows) {
      if (n.status === 'received') continue;
      try {
        await this.opts.mailer.send(
          n.notifier_email,
          OUTCOME_TEMPLATE[n.status],
          { reference: copyrightReference(n.id), contact: PROVIDER.copyrightEmail },
          emailLocaleFor(n.locale),
        );
        sent++;
      } catch (err) {
        this.opts.log?.warn({ err, noticeId: n.id }, 'sending a copyright outcome failed; the next sweep retries');
        await this.pool.query(`UPDATE copyright_notices SET outcome_sent_at = NULL WHERE id = $1`, [n.id]).catch(() => undefined);
      }
    }
    return sent;
  }
}
