import type { IncomingInvite, PlayUserEvent } from '@kurda/shared';

/**
 * The invites the banner shows, kept from `GET /play/invites` and the events
 * on your own channel. Pure, so the rules are tested apart from the banner:
 *
 * - only pending invites that have not run out are shown, newest first;
 * - a new invite from the same host for the same game replaces the old one
 *   (the server cancels the old one too, and says so);
 * - any answer — yours from another device, the host taking it back, the
 *   lobby starting or filling — removes it.
 */
export function addInvite(list: readonly IncomingInvite[], invite: IncomingInvite): IncomingInvite[] {
  const rest = list.filter((i) => i.id !== invite.id);
  return invite.status === 'pending' ? [invite, ...rest] : rest;
}

export function applyInviteEvent(list: readonly IncomingInvite[], event: PlayUserEvent): IncomingInvite[] {
  if (event.type === 'play_invite') return addInvite(list, event.invite);
  if (event.type === 'play_invite_update' && event.status !== 'pending') return list.filter((i) => i.id !== event.inviteId);
  return [...list];
}

export function liveInvites(list: readonly IncomingInvite[], now: number): IncomingInvite[] {
  return list
    .filter((i) => i.status === 'pending' && Date.parse(i.expiresAt) > now)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Milliseconds until the next of these runs out, so the banner can drop it then; null when none will. */
export function nextExpiry(list: readonly IncomingInvite[], now: number): number | null {
  const times = list.map((i) => Date.parse(i.expiresAt) - now).filter((ms) => ms > 0);
  return times.length ? Math.min(...times) : null;
}
