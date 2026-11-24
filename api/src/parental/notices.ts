import { safeTimeZone, type BirthMonth } from '@kurda/shared';
import type { Notification } from '../push/service.js';
import { recordNotifications } from '../notifications/inbox-service.js';
import { afterCommit, type Executor } from '../moderation/tx.js';
import { sendEmailJob, type SendEmailPayload } from '../jobs/email.js';
import type { JobQueue } from '../jobs/queue.js';
import { emailLocaleFor, type EmailLocale, type EmailTemplate } from '../email/templates.js';

/**
 * The notifications parental controls send, in the people category, and the emails a parent gets beside some of them.
 * English here for the list and push; the apps write their own words from `data`, whose `kind` says what happened and
 * whose ids and names say who with.
 */
export interface NoticePerson {
  id: string;
  username: string;
  display_name: string | null;
}

const nameOf = (p: NoticePerson): string => p.display_name?.trim() || p.username;

/** The teen a notice is about, as every kind names them. */
const teenData = (teen: NoticePerson) => ({ teenId: teen.id, teenName: nameOf(teen), teenUsername: teen.username });
/** The parent a notice is about. */
const parentData = (parent: NoticePerson) => ({ parentId: parent.id, parentName: nameOf(parent), parentUsername: parent.username });

/** A day as the English line says it, "1 December 2026"; the apps say it from `data` in the reader's own words and zone. */
const dayOf = (at: Date): string => at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** A birth month as the English line says it, "March 2011". */
const monthOf = (birth: BirthMonth): string =>
  new Date(Date.UTC(birth.year, birth.month - 1, 15)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** To a parent, once a teen entered their code. */
export function connectedNotice(teen: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls connected',
    body: `${nameOf(teen)} connected you as their parent. You can now see their learning and set their limits.`,
    data: { kind: 'parental_connected', ...teenData(teen) },
  };
}

/** To a teen's other parents, when another one connects; the same news goes by email (parental-parent-added). */
export function parentAddedNotice(teen: NoticePerson, added: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Another parent was connected',
    body: `${nameOf(added)} was connected as a parent of ${nameOf(teen)}. They can make the settings stricter, not looser.`,
    data: { kind: 'parental_parent_added', ...teenData(teen), ...parentData(added) },
  };
}

/** To a parent a teen disconnected; the same news goes by email (parental-ended). */
export function disconnectedNotice(teen: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls ended',
    body: `${nameOf(teen)} disconnected you from their parental controls.`,
    data: { kind: 'parental_ended', by: 'teen', ...teenData(teen) },
  };
}

/** To a teen whose parent stopped supervising them. */
export function stoppedNotice(parent: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls ended',
    body: `${nameOf(parent)} stopped supervising your account.`,
    data: { kind: 'parental_ended', by: 'parent', ...parentData(parent) },
  };
}

/** To a teen whose parent's account may no longer supervise anyone. Why is the parent's business, and is not said. */
export function barredNotice(parent: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls ended',
    body: `${nameOf(parent)}’s account can no longer supervise yours, so their parental controls have ended.`,
    data: { kind: 'parental_ended', by: 'account', ...parentData(parent) },
  };
}

/** To a teen on their 18th birthday, once for all their parents. */
export function grownUpTeenNotice(teen: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls ended',
    body: 'You’re 18 now, so parental controls have ended.',
    data: { kind: 'parental_ended', by: 'age', ...teenData(teen) },
  };
}

/** To each of their parents, the same day. */
export function grownUpParentNotice(teen: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls ended',
    body: `${nameOf(teen)} turned 18, so parental controls have ended.`,
    data: { kind: 'parental_ended', by: 'age', ...teenData(teen) },
  };
}

/** To a teen whose request to stop a parent's supervision has run its days; the parent hears it as a disconnect. */
export function leftNotice(parent: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Parental controls ended',
    body: `${nameOf(parent)} no longer supervises your account, as you asked.`,
    data: { kind: 'parental_ended', by: 'teen', ...parentData(parent) },
  };
}

/** To a parent, when their teen asks to stop their supervision, which ends at `endsAt`; the same news goes by email. */
export function leaveAskedNotice(teen: NoticePerson, endsAt: Date): Notification {
  return {
    category: 'friends',
    title: 'Asked to stop supervision',
    body: `${nameOf(teen)} asked to stop supervision. It ends on ${dayOf(endsAt)}.`,
    data: { kind: 'parental_leave', state: 'asked', ...teenData(teen), endsAt: endsAt.toISOString() },
  };
}

/** To that parent, when the teen takes the request back. */
export function leaveKeptNotice(teen: NoticePerson): Notification {
  return {
    category: 'friends',
    title: 'Staying connected',
    body: `${nameOf(teen)} chose to stay connected.`,
    data: { kind: 'parental_leave', state: 'kept', ...teenData(teen) },
  };
}

/**
 * The first parent corrected a teen's birth month: to the teen (`to: teen`), who is pointed to support if it is wrong,
 * or to another of their parents, who is told whose it is and who changed it.
 */
export function birthNotice(teen: NoticePerson, parent: NoticePerson, birth: BirthMonth, to: 'teen' | 'parent'): Notification {
  const month = monthOf(birth);
  return {
    category: 'friends',
    title: to === 'teen' ? 'Your birth month was corrected' : 'Birth month corrected',
    body:
      to === 'teen'
        ? `${nameOf(parent)} corrected your birth month to ${month}. If this is wrong, write to support.`
        : `${nameOf(parent)} corrected ${nameOf(teen)}’s birth month to ${month}.`,
    data: {
      kind: 'parental_birth',
      to,
      ...(to === 'parent' ? teenData(teen) : {}),
      ...parentData(parent),
      birthYear: String(birth.year),
      birthMonth: String(birth.month),
    },
  };
}

/**
 * A change to a teen's controls, to the teen (`to: teen`) or another of their parents (`to: parent`), naming the parent
 * who made the latest change; the page shows what the controls are now.
 */
export function changedNotice(teen: NoticePerson, changer: NoticePerson, to: 'teen' | 'parent'): Notification {
  return {
    category: 'friends',
    title: to === 'teen' ? 'Your parental controls changed' : 'Parental controls changed',
    body:
      to === 'teen'
        ? `${nameOf(changer)} changed your settings. Open Parental controls to see them.`
        : `${nameOf(changer)} changed ${nameOf(teen)}’s settings. Open Parental controls to see them.`,
    data: { kind: 'parental_changed', to, ...teenData(teen), ...parentData(changer) },
  };
}

/** To each parent, when the time zone a teen's day and bedtime are counted in changes. */
export function zoneNotice(teen: NoticePerson, timeZone: string): Notification {
  return {
    category: 'friends',
    title: 'Time zone changed',
    body: `${nameOf(teen)}’s day and bedtime are now counted in ${timeZone}.`,
    data: { kind: 'parental_zone', ...teenData(teen), timeZone },
  };
}

/** The emails parental controls send, each to a parent about their teen. */
export type ParentalTemplate = Extract<EmailTemplate, `parental-${string}`>;

/** Who a parental email goes to: only a confirmed address is written to. */
export interface MailRecipient {
  username: string;
  email: string | null;
  email_verified: boolean;
  locale: string;
}

/** A parent's email in their language, with their name and when it happened, or null when their address is not confirmed. */
export function parentalEmail(to: MailRecipient, template: ParentalTemplate, vars: Record<string, string>, now: Date): SendEmailPayload | null {
  if (!to.email || !to.email_verified) return null;
  return {
    to: to.email,
    template,
    vars: { username: to.username, time: `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`, ...vars },
    locale: emailLocaleFor(to.locale),
  };
}

/** The day a teen's leave ends, as a parent's email says it where they are: "1 December 2026", or "01.12.2026" in Kurmancî. */
export function leaveEndsOn(at: Date, locale: EmailLocale, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  if (locale === 'en') return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zone });
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: zone }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')}`;
}

/** How a notice already in the inbox is pushed, and where an email is queued; set once by the app, absent in processes that send nothing. */
let pushRecorded: ((userId: string, notification: Notification) => Promise<void>) | null = null;
let mailQueue: JobQueue | null = null;

export function setParentalPush(push: ((userId: string, notification: Notification) => Promise<void>) | null): void {
  pushRecorded = push;
}

export function setParentalMail(jobs: JobQueue | null): void {
  mailQueue = jobs;
}

/**
 * Writes notices to the inbox through `db`, in the caller's transaction when there is one, and pushes them and queues
 * `emails` once it has committed. A push or email that cannot go is no reason to undo what happened.
 */
export async function tellParental(
  db: Executor,
  items: ReadonlyArray<{ userId: string; notification: Notification }>,
  emails: ReadonlyArray<SendEmailPayload> = [],
): Promise<void> {
  if (items.length > 0) await recordNotifications(db, items);
  const push = pushRecorded;
  const jobs = mailQueue;
  if ((!push || items.length === 0) && (!jobs || emails.length === 0)) return;
  afterCommit(db, async () => {
    if (push) for (const { userId, notification } of items) await push(userId, notification).catch(() => undefined);
    if (jobs) for (const email of emails) await jobs.enqueue(sendEmailJob, email).catch(() => undefined);
  });
}
