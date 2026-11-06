import { Alert } from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { Translate } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';

/**
 * Backing out of a Peyvok Battle or a Rhyme Match lobby leaves it.
 *
 * A seat used to stay taken when its player went back: the others waited for
 * somebody who had gone, and a host who left kept a lobby open that nobody
 * would start. Now going back from the lobby — the header's back, the swipe,
 * Android's back, the lobby's own Leave — asks first, as a story game's lobby
 * asks (stories/game/Lobby): a host is told that leaving calls the game off
 * for everyone. Leaving tells the server, and the way back then goes on
 * whatever it answered: a lobby the server has already let go of is left, and
 * one it could not be told of empties itself when it sits idle. Nobody is
 * kept on a screen they asked to leave.
 *
 * `inLobby` is whether the viewer has a seat in a lobby still waiting to start.
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
 * Android's back in the middle of a game: "Leave this game?", keeping on
 * playing the first answer. The button and the edge swipe are easily made by
 * a thumb on its way to the board, and a game left by accident is not one
 * that can wait. Leaving is the screen's own back (`onLeave`).
 */
export function askLeaveGame(t: Translate, onLeave: () => void): void {
  Alert.alert(t('games.leave.title'), t('games.leave.body'), [
    { text: t('games.leave.stay'), style: 'cancel' },
    { text: t('games.leave.go'), style: 'destructive', onPress: onLeave },
  ]);
}
