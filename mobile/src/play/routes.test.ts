import { describe, expect, it } from 'vitest';
import { PLAY_GAMES, type PlayGame } from '@kurda/shared';
import { GAMES_LIST, lobbyRoute } from './routes';

describe('where a lobby opens', () => {
  it('has a screen of its own for every game there is, with the room’s id', () => {
    const names = PLAY_GAMES.map((g) => lobbyRoute(g, 'room-1'));
    for (const route of names) {
      expect(route.name).not.toBe('Tabs');
      expect(route.params).toEqual({ id: 'room-1' });
    }
    expect(new Set(names.map((r) => r.name)).size).toBe(PLAY_GAMES.length);
  });

  /*
   * A code, a notification or a card can name a game from before it was
   * retired. There is no screen to open, and opening nothing would leave the
   * person on a blank route: they land among the games there are.
   */
  it('opens Learn’s games for a game that is no longer part of Hevalo', () => {
    for (const game of ['dont-say', 'bluff', 'kingdom', 'something-new']) {
      expect(lobbyRoute(game as PlayGame, 'room-1')).toEqual(GAMES_LIST);
    }
    expect(GAMES_LIST).toEqual({ name: 'Tabs', params: { screen: 'Learn', params: { view: 'games' } } });
  });
});
