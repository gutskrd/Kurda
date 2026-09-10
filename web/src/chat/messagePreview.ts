import { INVITE_NAME_KEY, inviteLinkPattern, parseInvite } from '../lib/gameInvites';
import type { MessageKey } from '../i18n/en';

/** Just enough of the i18n contract to name a game — this file has no React. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

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
export function messagePreview(body: string, t: Translate): string {
  const invite = parseInvite(body);
  const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

  if (!invite) return collapse(body);

  // a row of text, so it says what the thing is rather than drawing a picture
  const label = t('games.invite.preview', { game: t(INVITE_NAME_KEY[invite.type]) });
  // whatever the sender typed around the link is worth keeping — "join me!" says
  // more than the label alone
  const rest = collapse(body.replace(inviteLinkPattern(), ' '));
  return rest ? `${rest} · ${label}` : label;
}

/** Trim a preview to fit, without cutting mid-character. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${[...text].slice(0, max - 1).join('')}…` : text;
}
