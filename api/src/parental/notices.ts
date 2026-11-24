import type { Notification } from '../push/service.js';
import { recordNotifications } from '../notifications/inbox-service.js';
import { afterCommit, type Executor } from '../moderation/tx.js';

/**
 * The notifications parental controls send, in the people category. English here for the list and push; the apps
 * write their own words from `data`, whose `kind` says what happened and whose ids and names say who with.
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

/** How a notice already in the inbox is pushed; set once by the app, absent in processes that push nothing. */
let pushRecorded: ((userId: string, notification: Notification) => Promise<void>) | null = null;

export function setParentalPush(push: ((userId: string, notification: Notification) => Promise<void>) | null): void {
  pushRecorded = push;
}

/**
 * Writes notices to the inbox through `db`, in the caller's transaction when there is one, and pushes them once it has
 * committed. A push that cannot go is no reason to undo what happened.
 */
export async function tellParental(db: Executor, items: ReadonlyArray<{ userId: string; notification: Notification }>): Promise<void> {
  if (items.length === 0) return;
  await recordNotifications(db, items);
  const push = pushRecorded;
  if (!push) return;
  afterCommit(db, async () => {
    for (const { userId, notification } of items) await push(userId, notification).catch(() => undefined);
  });
}
