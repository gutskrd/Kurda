import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { acceptInvite } from '../play/api';
import { GAME_NAME_KEY } from '../play/labels';
import { lobbyRoute } from '../play/routes';
import { isPlayGame } from '@kurda/shared';
import type { DeepLink, InboxItem } from './inbox';

/**
 * Where a notification goes when it is tapped — one place, for the inbox tab
 * and the notification centre, which used to map the links each on its own.
 * The centre sent "Profile" to the tab of that name — your own profile — with
 * the other person's id thrown away (rootStack.ts says why that route is
 * called UserProfile); the same mapping now serves both.
 *
 * An invite is accepted on the way, and lands in the game's lobby; one that
 * can no longer be accepted still opens the game, which says why it cannot be
 * joined. A gift opens the chat it was sent in.
 */
export async function followDeepLink(link: DeepLink, navigation: RootNavigation, client: ApiClient): Promise<void> {
  switch (link.screen) {
    case 'Chat':
      navigation.navigate('Chat', link.params);
      return;
    case 'Profile':
      navigation.navigate('UserProfile', { userId: link.params.userId });
      return;
    case 'EventQuests':
      navigation.navigate('EventQuests');
      return;
    case 'Notifications':
      navigation.navigate('Notifications');
      return;
    case 'PlayInvite': {
      const res = await acceptInvite(client, link.params.inviteId);
      const route = res.ok ? lobbyRoute(res.data.game, res.data.lobbyId) : lobbyRoute(link.params.game, link.params.lobbyId);
      navigation.navigate(route.name, route.params as never);
      return;
    }
    case 'GiftChat': {
      const chat = link.params.chat;
      if (chat.kind === 'dm') {
        const convos = await client.get<{ conversations: Array<{ userId: string; username: string }> }>('/chat/conversations');
        let username = convos.ok ? convos.data.conversations.find((c) => c.userId === chat.userId)?.username : undefined;
        if (!username) {
          const profile = await client.get<{ username: string }>(`/users/${chat.userId}`);
          username = profile.ok ? profile.data.username : undefined;
        }
        if (username) navigation.navigate('Chat', { userId: chat.userId, username });
        return;
      }
      const groups = await client.get<{ groups: Array<{ id: string; name: string }> }>('/me/groups');
      const group = groups.ok ? groups.data.groups.find((g) => g.id === chat.groupId) : undefined;
      if (group) navigation.navigate('GroupThread', { groupId: group.id, name: group.name });
      return;
    }
    default: {
      // a screen another part of the app adds to DeepLink (reports, account
      // standing) opens by its own name, with its own params
      const other = link as { screen: string; params?: object };
      (navigation.navigate as (screen: string, params?: object) => void)(other.screen, other.params);
    }
  }
}

/**
 * A notification's title and body. The server stores finished English text;
 * for an invite or a gift the app writes its own line from the kind, in the
 * reader's language. (English readers keep the server's line, which can name
 * the friend; the data the app gets does not.)
 */
export function notificationText(item: Pick<InboxItem, 'title' | 'body' | 'data'>, t: Translate, locale: string): { title: string; body: string } {
  if (locale === 'en') return { title: item.title, body: item.body };
  if (item.data.kind === 'play_invite' && isPlayGame(item.data.game)) {
    return { title: t('play.notification.inviteTitle'), body: t('play.notification.inviteBody', { game: t(GAME_NAME_KEY[item.data.game]) }) };
  }
  if (item.data.kind === 'gift') return { title: t('play.notification.giftTitle'), body: t('play.notification.giftBody') };
  return { title: item.title, body: item.body };
}
