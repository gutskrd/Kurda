import { inviteGlyph, inviteLabel, inviteLinkPattern, parseInvite } from '../lib/gameInvites';

/**
 * A message reduced to one line, for a conversation row or a notification.
 *
 * A game invite is sent as a link, so a conversation whose last message was an
 * invite showed a raw URL — `https://mykurda.com/app/games/wordle-battle?id=8f3c…`
 * — which is unreadable and tells you nothing. The link is replaced by what it
 * actually is, keeping any words the sender wrote alongside it.
 *
 * Used by both the conversation list and the arrival banner, so the two cannot
 * describe the same message differently.
 */
export function messagePreview(body: string): string {
  const invite = parseInvite(body);
  const collapse = (t: string): string => t.replace(/\s+/g, ' ').trim();

  if (!invite) return collapse(body);

  const label = `${inviteGlyph(invite.type)} ${inviteLabel(invite.type)} invite`;
  // whatever the sender typed around the link is worth keeping — "join me!" says
  // more than the label alone
  const rest = collapse(body.replace(inviteLinkPattern(), ' '));
  return rest ? `${rest} · ${label}` : label;
}

/** Trim a preview to fit, without cutting mid-character. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${[...text].slice(0, max - 1).join('')}…` : text;
}
