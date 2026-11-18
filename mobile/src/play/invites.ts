import { isPlayGame, type IncomingInvite, type PlayUserEvent } from '@kurda/shared';

/**
 * The invites the banner shows, from `GET /play/invites` and your own channel's events. Pure, so the rules are
 * tested apart from the banner: only pending, unexpired invites to games this app can open are shown, newest first;
 * a new invite from the same host for the same game replaces the old one; and any answer from anywhere removes it.
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
    .filter((i) => i.status === 'pending' && Date.parse(i.expiresAt) > now && isPlayGame(i.game))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Milliseconds until the next invite expires, so the banner can drop it then; null when none will. */
export function nextExpiry(list: readonly IncomingInvite[], now: number): number | null {
  const times = list.map((i) => Date.parse(i.expiresAt) - now).filter((ms) => ms > 0);
  return times.length ? Math.min(...times) : null;
}
