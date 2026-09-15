import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useChallengeSocket } from './useChallengeSocket';
import { useI18n } from '../i18n/I18nContext';

/**
 * App-wide challenge handler (KUR-088). Prompts on an incoming challenge and
 * jumps both players into the game room once accepted — mounted under the
 * navigator so it works from any screen. Renders nothing.
 */
export function ChallengeListener() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();

  useChallengeSocket(
    useCallback(
      (ev) => {
        if (ev.type === 'challenge_accepted' && ev.roomId) {
          navigation.navigate('Game', { roomId: ev.roomId });
        } else if (ev.type === 'challenge_invite' && ev.from) {
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
