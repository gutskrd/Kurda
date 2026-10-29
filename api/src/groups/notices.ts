import type { GroupBanDuration } from '@kurda/shared';
import type { Notification } from '../push/service.js';

/**
 * The lines a group sends to people's notifications (and as a push), in the
 * social category friend requests and gifts use. English here, for the list
 * and the push; the apps write their own words from `data`, whose `kind` says
 * what happened and `groupId` which group to open.
 */
export type GroupNoticeKind = 'group_removed' | 'group_banned' | 'group_request' | 'group_request_approved' | 'group_request_declined';

/** Pushes a line already written to someone's notifications (jobs/push-jobs.ts `pushRecorded`). */
export type PushNotice = (userId: string, notification: Notification) => Promise<void>;

export interface NoticeGroup {
  id: string;
  name: string;
  privacy: 'open' | 'invite';
}

function notice(kind: GroupNoticeKind, group: NoticeGroup, title: string, body: string, data: Record<string, string> = {}): Notification {
  return { category: 'friends', title, body, data: { kind, groupId: group.id, groupName: group.name, privacy: group.privacy, ...data } };
}

/** A day as the English line says it: "5 November 2026". */
function day(at: Date): string {
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Removed, which leaves no ban: an open group they can join again, an invite-only one they can be added to again. */
export function removedNotice(group: NoticeGroup): Notification {
  const again = group.privacy === 'open' ? 'You can join again.' : 'An admin can add you again.';
  return notice('group_removed', group, 'Removed from a group', `You were removed from ${group.name}. ${again}`);
}

const BAN_SPANS: Record<GroupBanDuration, string> = { '1d': 'for a day', '7d': 'for a week', perm: 'for good' };

/** Banned: for how long, the reason when one was given, and that they can ask to come back. */
export function bannedNotice(group: NoticeGroup, duration: GroupBanDuration, until: Date | null, reason: string | null): Notification {
  const body = [`You were banned from ${group.name} ${BAN_SPANS[duration]}.`, reason ? `Reason: “${reason}”` : null, 'You can ask to come back.']
    .filter(Boolean)
    .join(' ');
  return notice('group_banned', group, 'Banned from a group', body, {
    duration,
    ...(until ? { until: until.toISOString() } : {}),
    ...(reason ? { reason } : {}),
  });
}

/** To an owner or admin: how many people are waiting to come back. */
export function requestNotice(group: NoticeGroup, count: number): Notification {
  const body = count === 1 ? `Someone asked to rejoin ${group.name}.` : `${count} people asked to rejoin ${group.name}.`;
  return notice('group_request', group, 'Requests to come back', body, { count: String(count) });
}

/** Their request was accepted: back in, or free to join or be added again when a rule kept them from being put back. */
export function approvedNotice(group: NoticeGroup, rejoined: boolean): Notification {
  const body = rejoined
    ? `You're back in ${group.name}.`
    : group.privacy === 'open'
      ? `You can join ${group.name} again.`
      : `An admin can add you to ${group.name} again.`;
  return notice('group_request_approved', group, 'Request accepted', body, { rejoined: String(rejoined) });
}

/** Their request was turned down: when they may ask again, or (`next` null) that the admins stopped their requests. */
export function declinedNotice(group: NoticeGroup, next: Date | null): Notification {
  const first = `Your request to rejoin ${group.name} wasn't accepted.`;
  const body = next ? `${first} You can ask again on ${day(next)}.` : `${first} The admins aren't taking requests from you for this group.`;
  return notice('group_request_declined', group, 'Request not accepted', body, next ? { until: next.toISOString() } : { closed: 'true' });
}
