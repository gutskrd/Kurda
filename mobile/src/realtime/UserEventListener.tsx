import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useUserEvents } from './useUserEvents';
import { useI18n } from '../i18n/I18nContext';

/**
 * The one listener on your own channel (KUR-088, and matchmaking KUR-050).
 *
 * Mounted under the navigator so it works from any screen, and mounted **once**:
 * a second caller of `useUserEvents` means a second socket and every event
 * delivered twice. Anything else that needs a user-channel event belongs here.
 *
 * Renders nothing.
 */
export function UserEventListener() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();

  useUserEvents(
    useCallback(
      (ev) => {
        /*
         * A queue match and an accepted challenge are the same thing by the time
         * they get here: a room that exists and is waiting for you. Handling it
         * app-wide rather than on the Play screen means walking away from that
         * screen no longer costs you the match — the server had already built
         * the room and told both players, and the phone used to discard it.
         */
        if ((ev.type === 'challenge_accepted' || ev.type === 'match_found') && ev.roomId) {
          navigation.navigate('Game', { roomId: ev.roomId });
          return;
        }
        /*
         * `match_timeout` is deliberately not handled here. The queue dropping
         * you is only news if you are still watching for it, and the Play screen
         * asks the server directly — an Alert from anywhere in the app would
         * interrupt whatever you moved on to.
         */
        if (ev.type === 'challenge_invite' && ev.from) {
          const from = ev.from;
          Alert.alert(t('challenge.title'), t('challenge.received'), [
            { text: t('friends.decline'), style: 'cancel', onPress: () => void client.post(`/challenges/${from}/decline`) },
            {
              text: t('friends.accept'),
              onPress: () =>
                void client.post<{ roomId: string }>(`/challenges/${from}/accept`).then((res) => {
                  if (res.ok) navigation.navigate('Game', { roomId: res.data.roomId });
                }),
            },
          ]);
        }
      },
      [client, navigation, t],
    ),
  );

  return null;
}
