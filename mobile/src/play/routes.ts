import type { PlayGame } from '@kurda/shared';
import type { RootStackParamList } from '../navigation/rootStack';

/**
 * Where a lobby of each online game lives in the app.
 *
 * Every surface that opens a game — an invite banner, a notification, a game
 * card in a chat, a pasted link, a rematch — goes through here, so a game's
 * screen is named in one place. Each of these screens joins the lobby itself
 * when the person is allowed in and is not yet (the join rule is the server's).
 *
 * A game's name can come from something written long ago: a code, a card in
 * an old chat, a notification. One that names a game Hevalo no longer has (or
 * does not have yet, in this version) opens Learn's games rather than
 * nothing, so the person lands among what can be played.
 */
export type LobbyRoute =
  | { name: 'WordleBattle'; params: RootStackParamList['WordleBattle'] }
  | { name: 'RhymeMatch'; params: RootStackParamList['RhymeMatch'] }
  | { name: 'StoryGame'; params: RootStackParamList['StoryGame'] }
  | { name: 'LastLetter'; params: RootStackParamList['LastLetter'] }
  | { name: 'Impostor'; params: RootStackParamList['Impostor'] }
  | { name: 'WhoAmI'; params: RootStackParamList['WhoAmI'] }
  | { name: 'Tabs'; params: RootStackParamList['Tabs'] };

/** Learn on its Games view: where a link to a game that is not here any more lands. */
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
      // the types say every game is named above; what was stored before a game was retired says otherwise
      return GAMES_LIST;
  }
}
