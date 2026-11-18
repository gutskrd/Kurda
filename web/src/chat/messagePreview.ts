import { isPlayGame, type ChatGameRef, type ChatMessageKind, type GiftCard } from '@kurda/shared';
import { INVITE_NAME_KEY, hasRetiredInvite, inviteLinkPattern, parseInvite, withoutRetiredInvites } from '../lib/gameInvites';
import type { MessageKey } from '../i18n/en';

/** Just enough of the i18n contract to name a game — this file has no React. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * A message in one line, for the conversation list and arrival banners alike. Game invite links become the game's
 * name, keeping the sender's words. Gifts read "Gift", or the item once unwrapped, and game cards read the game's
 * name (shared `ChatMessageKind`). Pass the message or its text. The text has no emoji, since rows draw the icon
 * (chat/PreviewIcon.tsx).
 */
export interface Previewable {
  body: string | null;
  kind?: ChatMessageKind;
  gift?: GiftCard | null;
  game?: ChatGameRef | null;
}

export function messagePreview(message: Previewable | string, t: Translate): string {
  const m: Previewable = typeof message === 'string' ? { body: message } : message;
  // the item is a surprise until its recipient has unwrapped it, so a banner
  // or a list names it only once the reader has opened theirs
  if (m.kind === 'gift') return m.gift?.myOpened ? m.gift.name : t('chat.preview.gift');
  if (m.kind === 'game') {
    // a card for a game that is no longer part of Hevalo is still a game card, with no name to give it
    return m.game && isPlayGame(m.game.game) ? t('games.invite.preview', { game: t(INVITE_NAME_KEY[m.game.game]) }) : t('chat.preview.game');
  }
  const body = m.body ?? '';
  const invite = parseInvite(body);
  const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

  if (!invite && hasRetiredInvite(body)) {
    // an old link to a game that is gone: what was typed round it, and what it was, never the bare address
    const rest = collapse(withoutRetiredInvites(body));
    return rest ? `${rest} · ${t('chat.preview.game')}` : t('chat.preview.game');
  }
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
