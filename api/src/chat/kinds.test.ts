import { describe, expect, it } from 'vitest';
import { gameRef, previewText, type KindColumns } from './kinds.js';

const row = (over: Partial<KindColumns>): KindColumns => ({
  kind: 'text',
  gift_batch_id: null,
  game: null,
  game_lobby_id: null,
  ...over,
});

describe('message kinds', () => {
  it('reads a game card’s game and lobby', () => {
    const lobbyId = '6f1c1a9e-8d7b-4e43-9a55-2f3c1d0b7e21';
    expect(gameRef(row({ kind: 'game', game: 'stories', game_lobby_id: lobbyId }))).toEqual({ game: 'stories', lobbyId });
  });

  it('passes on no game for anything that is not a card of a game the apps know', () => {
    expect(gameRef(row({ kind: 'text', game: 'stories', game_lobby_id: 'x' }))).toBeNull();
    expect(gameRef(row({ kind: 'game', game: 'ranked-quiz', game_lobby_id: 'x' }))).toBeNull();
    expect(gameRef(row({ kind: 'game', game: 'wordle-battle', game_lobby_id: null }))).toBeNull();
  });

  it('previews text as itself and a gift or a game as a line old phone builds can print', () => {
    expect(previewText('text', 'Silav!')).toBe('Silav!');
    expect(previewText('gift', null)).toBe('🎁 Gift');
    expect(previewText('game', null)).toBe('🎮 Game invite');
    // never null, whatever is stored
    expect(previewText('text', null)).toBe('');
  });
});
