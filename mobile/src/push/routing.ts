import { letterNoticeOf } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { RootNavigation } from '../navigation/rootStack';
import { followDeepLink } from '../notifications/followLink';
import { isGroupNotice, resolveDeepLink, type DeepLink } from '../notifications/inbox';

/**
 * Where a tapped push opens. The push carries the same `data` the in-app list stores (a `kind` with its ids) plus
 * its send category (api push/service.ts), so it goes through the list's resolver and lands where tapping the
 * same list row would:
 *
 * - a badge → Badges; a league promotion or Pêla week → the league; an invite → its game; a gift → its chat; a
 *   letter
 *   → the letters window, with its bird named; a report outcome or account decision → where those live
 *   (notifications/inbox.ts);
 * - a streak reminder names no screen → the lessons;
 * - anything else (a test send, an unknown kind, a caring message read in full in the list) → the notification
 *   list.
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
 * Whether a push is about the conversation on screen: a message or gift in the open chat, whose content is
 * arriving there anyway. News about one's own place in a group (removed, banned) is not in the chat, so it is
 * shown. A letter is not shown over the letters window, which lands its bird itself, nor over its own
 * correspondence, which reloads; over any other correspondence it is shown.
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
