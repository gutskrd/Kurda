/**
 * What families tell people: notices in the inbox and on the phone, in English here with the facts in `data` for the
 * apps to word, and the two emails a parent gets about a child's profile with their signed one-tap links. A child is
 * never written to: every notice and email here goes to an adult or a teen.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Notification } from '../push/service.js';
import type { SendEmailPayload } from '../jobs/email.js';
import { emailLocaleFor } from '../email/templates.js';

/** Who a notice names: an id and the name they go by. */
export interface Named {
  id: string;
  name: string;
}

/** To the owner, when an adult joins with their code. */
export function joinedNotice(member: Named): Notification {
  return {
    category: 'friends',
    title: 'Someone joined your family',
    body: `${member.name} joined your family on Hevalo.`,
    data: { kind: 'family_joined', userId: member.id, name: member.name },
  };
}

/** To a teen the owner added to the family, which they can leave. */
export function teenAddedNotice(owner: Named): Notification {
  return {
    category: 'friends',
    title: 'You were added to a family',
    body: `${owner.name} added you to their family on Hevalo. Your family sees your XP this week. You can leave in Settings, then Family.`,
    data: { kind: 'family_added', ownerId: owner.id, ownerName: owner.name },
  };
}

/** To someone the owner took out of the family, or whose family the owner ended. */
export function removedNotice(owner: Named, ended: boolean): Notification {
  return {
    category: 'friends',
    title: ended ? 'Your family was closed' : 'You left a family',
    body: ended ? `${owner.name} closed the family on Hevalo.` : `${owner.name} took you out of their family on Hevalo.`,
    data: { kind: ended ? 'family_ended' : 'family_removed', ownerId: owner.id, ownerName: owner.name },
  };
}

/** To the owner, when a member leaves. */
export function leftNotice(member: Named): Notification {
  return {
    category: 'friends',
    title: 'Someone left your family',
    body: `${member.name} left your family on Hevalo.`,
    data: { kind: 'family_left', userId: member.id, name: member.name },
  };
}

/** To a parent, when their child asks for something that is bought. */
export function askedNotice(child: Named): Notification {
  return {
    category: 'friends',
    title: `${child.name} asked you for something`,
    body: `${child.name} would like something that is bought. You can answer in Settings, then Family.`,
    data: { kind: 'family_asked', childId: child.id, childName: child.name },
  };
}

/** To a parent, once, when their child turns 13 and the profile can become the teen's own account. */
export function thirteenNotice(child: Named): Notification {
  return {
    category: 'friends',
    title: `${child.name} is 13 now`,
    body: `${child.name} can have an account of their own now, linked to you by parental controls. You can set it up in Settings, then Family.`,
    data: { kind: 'family_thirteen', childId: child.id, childName: child.name },
  };
}

/** To a parent, when wrong PINs on a phone switched to their child have locked the family PIN for an hour or more. */
export function pinLockedNotice(minutes: number, until: Date): Notification {
  const hours = Math.round(minutes / 60);
  return {
    category: 'friends',
    title: 'Your family PIN is locked',
    body:
      `Someone entered a wrong family PIN many times on a phone switched to your child, so it is locked for ${hours === 1 ? 'an hour' : `${hours} hours`}. ` +
      'You can choose a new PIN in Settings, then Family.',
    data: { kind: 'family_pin_locked', minutes: String(minutes), until: until.toISOString() },
  };
}

/** What a signed link in a parent's email does. */
export type ChildLinkAction = 'remove' | 'keep';

/**
 * How long each link works: the confirmation's delete link a week, so an old email lying about deletes nothing, and the
 * warning's keep link past the deletion it warns of.
 */
export const CHILD_LINK_DAYS: Record<ChildLinkAction, number> = { remove: 7, keep: 45 };

const LINK_LABEL = 'hevalo-family-link-v1';

function signature(secret: string, body: string): string {
  return createHmac('sha256', secret).update(`${LINK_LABEL}:${body}`).digest('base64url');
}

/**
 * A link's token: the child, what it does and until when, signed with the server's secret, so it needs no table and
 * says nothing anyone could change. A deleted profile makes its links do nothing.
 */
export function childLinkToken(secret: string, childId: string, action: ChildLinkAction, now: Date = new Date()): string {
  const until = Math.floor(now.getTime() / 1000) + CHILD_LINK_DAYS[action] * 86_400;
  const body = `${childId}.${action}.${until}`;
  return `${body}.${signature(secret, body)}`;
}

/** The child and action a token is for, or null for any token that is not ours, is changed or has run out. */
export function readChildLink(secret: string, token: string, now: Date = new Date()): { childId: string; action: ChildLinkAction } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [childId, action, until, sig] = parts as [string, string, string, string];
  if (action !== 'remove' && action !== 'keep') return null;
  const want = Buffer.from(signature(secret, `${childId}.${action}.${until}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (!/^\d+$/.test(until) || Number(until) * 1000 <= now.getTime()) return null;
  return { childId, action };
}

/** Who a family email goes to: a parent's confirmed address, in their language. */
export interface ParentRecipient {
  username: string;
  email: string | null;
  email_verified: boolean;
  locale: string;
}

/**
 * The email a parent gets about a child's profile, with its link on the website, or null without a confirmed
 * address. `base` is APP_BASE_URL.
 */
export function childEmail(
  to: ParentRecipient,
  template: 'family-child-added' | 'family-child-unused',
  child: { id: string; name: string },
  opts: { base: string; secret: string; now?: Date },
): SendEmailPayload | null {
  if (!to.email || !to.email_verified) return null;
  const now = opts.now ?? new Date();
  const base = opts.base.replace(/\/+$/, '');
  const action: ChildLinkAction = template === 'family-child-added' ? 'remove' : 'keep';
  const token = childLinkToken(opts.secret, child.id, action, now);
  return {
    to: to.email,
    template,
    vars: {
      username: to.username,
      child: child.name,
      time: `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      link: `${base}/family/child?action=${action}&token=${encodeURIComponent(token)}`,
      privacy: `${base}/privacy#children`,
    },
    locale: emailLocaleFor(to.locale),
  };
}
