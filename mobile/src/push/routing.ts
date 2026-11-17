import { letterNoticeOf } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { RootNavigation } from '../navigation/rootStack';
import { followDeepLink } from '../notifications/followLink';
import { isGroupNotice, resolveDeepLink, type DeepLink } from '../notifications/inbox';

/**
 * Where a tapped push opens (KUR-094). The push carries the same `data` the
 * in-app list stores — a `kind` with its ids — plus the category it was sent
 * under (api push/service.ts), so it goes through the list's own resolver and
 * lands where tapping the same line in the list would:
 *
 * - a badge → Badges; moving up a league, a Pêla week → the league;
 *   an invite → its game; a gift → the chat it is in; a letter → the letters
 *   window, with its bird named; a report outcome, a decision on the account
 *   → where those are (notifications/inbox.ts);
 * - a streak reminder names no screen → the lessons, which is what it asks for;
 * - anything else (a test send, a kind this version does not know, a caring
 *   message, which is read in full in the list) → the notification list,
 *   where it is waiting too.
 */
export type PushTarget = { kind: 'link'; link: DeepLink } | { kind: 'learn' } | { kind: 'inbox' };

export function pushTarget(data: Record<string, unknown> | null | undefined): PushTarget {
  const fields = data ?? {};
  const link = resolveDeepLink(fields);
  if (link && link.screen !== 'CaringMessage') return { kind: 'link', link };
  if (!link && fields.category === 'streak') return { kind: 'learn' };
  return { kind: 'inbox' };
}

export function openPushTarget(target: PushTarget, navigation: RootNavigation, client: ApiClient): void {
  switch (target.kind) {
    case 'link':
      void followDeepLink(target.link, navigation, client);
      return;
    case 'learn':
      navigation.navigate('Tabs', { screen: 'Learn' });
      return;
    case 'inbox':
      navigation.navigate('NotificationCenter');
      return;
  }
}

/** The screen on top, as the navigation container reports it. */
export interface RouteLike {
  name: string;
  params?: object;
}

/**
 * Whether a push is about the conversation already open on screen — a
 * message, or a gift, in the chat being read. Its words are arriving there
 * anyway, so it is not shown again as a banner over them. News about one's
 * own place in a group (removed, banned) is not in the chat, and is shown.
 *
 * A letter is not shown over the letters window, which hears it and lands
 * its bird itself, nor over the correspondence it came in, which reads
 * itself again and shows it. Over any other correspondence it is shown.
 */
export function isConversationOnScreen(data: Record<string, unknown> | null | undefined, route: RouteLike | undefined): boolean {
  if (!route || isGroupNotice(data ?? {})) return false;
  const params = (route.params ?? {}) as Record<string, unknown>;
  const letter = letterNoticeOf(data);
  if (letter) return route.name === 'Letters' || (route.name === 'LetterThread' && letter.threadId !== null && params.threadId === letter.threadId);
  const link = resolveDeepLink(data ?? {});
  if (link?.screen === 'Chat') return route.name === 'Chat' && params.userId === link.params.userId;
  if (link?.screen === 'GroupThread') return route.name === 'GroupThread' && params.groupId === link.params.groupId;
  return false;
}
