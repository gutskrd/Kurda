import type { PlayGame } from '@kurda/shared';
import type { RootStackParamList } from '../navigation/rootStack';

/**
 * Where each online game's lobby lives in the app. Every way into a game (invite banner, notification, chat card,
 * link, rematch) goes through here, and each screen joins the lobby itself when allowed. A game name from old data
 * that this version does not have opens Learn's games instead of nothing.
 */
type LobbyRoute =
  | { name: 'WordleBattle'; params: RootStackParamList['WordleBattle'] }
  | { name: 'RhymeMatch'; params: RootStackParamList['RhymeMatch'] }
  | { name: 'StoryGame'; params: RootStackParamList['StoryGame'] }
  | { name: 'LastLetter'; params: RootStackParamList['LastLetter'] }
  | { name: 'Impostor'; params: RootStackParamList['Impostor'] }
  | { name: 'WhoAmI'; params: RootStackParamList['WhoAmI'] }
  | { name: 'Tabs'; params: RootStackParamList['Tabs'] };

/** Learn's Games view, where a link to a game no longer here lands. */
export const GAMES_LIST: LobbyRoute = { name: 'Tabs', params: { screen: 'Learn', params: { view: 'games' } } };

export function lobbyRoute(game: PlayGame, id: string): LobbyRoute {
  switch (game) {
    case 'wordle-battle':
      return { name: 'WordleBattle', params: { id } };
    case 'rhyme-match':
      return { name: 'RhymeMatch', params: { id } };
    case 'stories':
      return { name: 'StoryGame', params: { id } };
    case 'last-letter':
      return { name: 'LastLetter', params: { id } };
    case 'impostor':
      return { name: 'Impostor', params: { id } };
    case 'who-am-i':
      return { name: 'WhoAmI', params: { id } };
    default:
      // The types cover every game, but data stored before a game was retired may not.
      return GAMES_LIST;
  }
}
