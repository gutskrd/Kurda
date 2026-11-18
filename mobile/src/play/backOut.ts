import { Alert } from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { Translate } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';

/**
 * Backing out of a Peyvok Battle or Rhyme Match lobby leaves it, after asking first as a story lobby does
 * (stories/game/Lobby); a host is told leaving cancels the game for everyone. The way back proceeds whatever the
 * server answers, since a lobby it was not told about empties itself when idle. `inLobby` is whether the viewer
 * has a seat in a lobby still waiting to start.
 */
export function useLeaveLobbyOnBack(inLobby: boolean, isHost: boolean, leave: () => Promise<unknown>): void {
  const navigation = useNavigation();
  const { t } = useI18n();
  usePreventRemove(inLobby, ({ data }) => {
    Alert.alert(
      t(isHost ? 'stories.lobby.cancelTitle' : 'stories.lobby.leaveTitle'),
      t(isHost ? 'stories.lobby.cancelBody' : 'stories.lobby.leaveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t(isHost ? 'stories.lobby.cancelGame' : 'stories.lobby.leave'),
          style: 'destructive',
          onPress: () => {
            void leave()
              .catch(() => undefined)
              .finally(() => navigation.dispatch(data.action));
          },
        },
      ],
    );
  });
}

/**
 * Android's back during a game asks "Leave this game?" with keep playing first, since the gesture is easily made by
 * accident. Leaving uses the screen's own back (`onLeave`).
 */
export function askLeaveGame(t: Translate, onLeave: () => void): void {
  Alert.alert(t('games.leave.title'), t('games.leave.body'), [
    { text: t('games.leave.stay'), style: 'cancel' },
    { text: t('games.leave.go'), style: 'destructive', onPress: onLeave },
  ]);
}
