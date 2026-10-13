import type { PlayGame } from '@kurda/shared';
import type { RootStackParamList } from '../navigation/rootStack';

/**
 * Where a lobby of each online game lives in the app.
 *
 * Every surface that opens a game — an invite banner, a notification, a game
 * card in a chat, a pasted link, a rematch — goes through here, so a game's
 * screen is named in one place. Each of these screens joins the lobby itself
 * when the person is allowed in and is not yet (the join rule is the server's).
 */
export type LobbyRoute =
  | { name: 'WordleBattle'; params: RootStackParamList['WordleBattle'] }
  | { name: 'RhymeMatch'; params: RootStackParamList['RhymeMatch'] }
  | { name: 'StoryGame'; params: RootStackParamList['StoryGame'] };

export function lobbyRoute(game: PlayGame, id: string): LobbyRoute {
  switch (game) {
    case 'wordle-battle':
      return { name: 'WordleBattle', params: { id } };
    case 'rhyme-match':
      return { name: 'RhymeMatch', params: { id } };
    case 'stories':
      return { name: 'StoryGame', params: { id } };
  }
}
