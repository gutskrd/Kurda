import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import type { GroupChatCleared } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { clearGroupChat } from './api';
import { groupError } from './groupError';

/**
 * Clearing a group chat, as the reader sees it.
 *
 * Two clears can stand at once — an admin's for everyone and the reader's own
 * — and the later of the two is where the reader's chat begins. The server
 * leaves out everything before it; the thread does the same with what it
 * already holds when a clear happens while it is open.
 */

/** Where the reader's view of the chat begins: the later of the two clears, or null when neither was made. */
export function clearedSince(cleared: GroupChatCleared | null | undefined): string | null {
  const everyone = cleared?.forEveryone?.at ?? null;
  const mine = cleared?.forMe ?? null;
  if (!everyone || !mine) return everyone ?? mine;
  return Date.parse(mine) > Date.parse(everyone) ? mine : everyone;
}

/** What was said after `since`: what is left to see once the chat was cleared then. */
export function afterClear<T extends { createdAt: string }>(messages: readonly T[], since: string | null): T[] {
  if (!since) return [...messages];
  const at = Date.parse(since);
  return messages.filter((m) => Date.parse(m.createdAt) > at);
}

/**
 * What the top of the chat says about clearing: nothing (`none`), that the
 * reader cleared it for themselves (`mine`), or that an admin cleared it for
 * everyone, who and when (`everyone`) — whichever came last.
 */
export type ClearedView = { kind: 'none' } | { kind: 'mine'; at: string } | { kind: 'everyone'; at: string; by: string | null };

export function clearedView(cleared: GroupChatCleared | null | undefined): ClearedView {
  const since = clearedSince(cleared);
  if (!since) return { kind: 'none' };
  const everyone = cleared?.forEveryone;
  if (everyone && Date.parse(everyone.at) >= Date.parse(since)) return { kind: 'everyone', at: everyone.at, by: everyone.by };
  return { kind: 'mine', at: since };
}

/**
 * A clear made on this phone, passed to the thread that is open under the
 * screen it was made on (the group's info page): the room tells every member
 * about a clear for everyone, but nobody about a clear for oneself.
 */
type Listener = (groupId: string, cleared: GroupChatCleared) => void;
const listeners = new Set<Listener>();

/** Hear the clears made on this phone for `groupId` while mounted. */
export function useClearedHere(groupId: string, onCleared: (cleared: GroupChatCleared) => void): void {
  const ref = useRef(onCleared);
  ref.current = onCleared;
  useEffect(() => {
    const listen: Listener = (id, cleared) => id === groupId && ref.current(cleared);
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, [groupId]);
}

/**
 * "Clear chat for me" and "Clear chat for everyone", from the thread's menu
 * and from the group's info page alike: asked first, in words that say
 * exactly what happens, then done, felt and said aloud. A refusal is felt as
 * one and handed to `onError` to show where the reader is looking.
 */
export function useClearChat(groupId: string, memberCount: number, onError: (message: string) => void): (scope: 'me' | 'everyone') => void {
  const { client } = useAuth();
  const { t } = useI18n();
  return useCallback(
    (scope) => {
      const run = async (): Promise<void> => {
        const res = await clearGroupChat(client, groupId, scope);
        if (!res.ok) {
          haptic('wrong');
          onError(groupError(res.error, t));
          return;
        }
        haptic('correct');
        AccessibilityInfo.announceForAccessibility?.(t(scope === 'me' ? 'groups.clear.doneMe' : 'groups.clear.doneEveryone'));
        for (const listen of [...listeners]) listen(groupId, res.data.cleared);
      };
      const everyone = scope === 'everyone';
      const action = t(everyone ? 'groups.clear.forEveryone' : 'groups.clear.forMe');
      Alert.alert(
        everyone ? t('groups.clear.askEveryone', { count: memberCount }) : t('groups.clear.askMe'),
        t(everyone ? 'groups.clear.askEveryoneBody' : 'groups.clear.askMeBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: action, style: 'destructive', onPress: () => void run() },
        ],
      );
    },
    [client, groupId, memberCount, onError, t],
  );
}
