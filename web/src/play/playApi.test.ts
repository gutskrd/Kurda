import { describe, it, expect, vi, afterEach } from 'vitest';
import { englishOnly as t } from '../i18n/I18nProvider';
import type { ApiClient } from '../lib/api';
import { joinLobby, joinPath, lobbyPath, playError, recentFriends, rememberFriends, summaryParts } from './playApi';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('where a game is', () => {
  it('sends someone in a story game to its own page, and a battle or match to its lobby address', () => {
    expect(lobbyPath('stories', 's1')).toBe('/app/games/stories/play/s1');
    expect(lobbyPath('wordle-battle', 'b1')).toBe('/app/games/wordle-battle?id=b1');
    expect(lobbyPath('rhyme-match', 'r1')).toBe('/app/games/rhyme-match?id=r1');
  });

  it('sends someone not in a game yet to its invite link', () => {
    expect(joinPath('stories', 's1')).toBe('/app/games/stories?id=s1');
    expect(joinPath('wordle-battle', 'b1')).toBe('/app/games/wordle-battle?id=b1');
  });
});

describe('joinLobby', () => {
  const client = (answer: unknown) => ({ post: vi.fn(async () => answer) }) as unknown as ApiClient & { post: ReturnType<typeof vi.fn> };

  it('joins through each game’s own route, a story game by its id', async () => {
    const c = client({ ok: true, data: {} });
    await joinLobby(c, 'stories', 's1');
    expect(c.post).toHaveBeenCalledWith('/story-games/join', { id: 's1', extraTime: false });
    // a remembered Extra time comes along to a card's or a next round's join
    localStorage.setItem('hevalo.stories.extraTime', 'on');
    await joinLobby(c, 'stories', 's2');
    expect(c.post).toHaveBeenCalledWith('/story-games/join', { id: 's2', extraTime: true });
    localStorage.clear();
    await joinLobby(c, 'rhyme-match', 'r1');
    expect(c.post).toHaveBeenCalledWith('/rhyme/matches/r1/join', undefined);
  });

  it('takes being in it already as in', async () => {
    const res = await joinLobby(client({ ok: false, error: { kind: 'client', message: 'x', code: 'ALREADY_JOINED' } }), 'wordle-battle', 'b1');
    expect(res.ok).toBe(true);
  });
});

describe('playError', () => {
  const err = (code: string) => ({ kind: 'client' as const, message: 'x', code });

  it('says every refusal of a game nobody may see the same way', () => {
    for (const code of ['GAME_NOT_FOUND', 'NOT_FOUND', 'INVITE_NOT_FOUND', 'GAME_UNAVAILABLE']) {
      expect(playError(err(code), t)).toBe(t('stories.error.notFound'));
    }
  });

  it('says full, started and closed plainly', () => {
    expect(playError(err('BATTLE_FULL'), t)).toBe('This game is full.');
    expect(playError(err('GAME_STARTED'), t)).toBe('This game has already started.');
    expect(playError(err('INVITE_CLOSED'), t)).toBe('This invite is no longer open.');
  });

  it('leaves a story game’s own refusals to the story words', () => {
    expect(playError(err('TOO_MANY_GAMES'), t)).toBe(t('stories.error.tooMany'));
  });
});

describe('summaryParts', () => {
  it('names what an invite is for, beyond the game', () => {
    expect(summaryParts('wordle-battle', { difficulty: 'hard' }, t)).toEqual([{ text: 'Hard' }]);
    expect(summaryParts('rhyme-match', { dialect: 'sorani' }, t)).toEqual([{ text: 'Soranî' }]);
  });

  it('marks a story’s title with its language, and falls back to its length', () => {
    expect(summaryParts('stories', { storyTitle: 'Qelema Şîn', dialect: 'kurmanci', questionCount: 5 }, t)).toEqual([
      { text: 'Qelema Şîn', lang: 'ku', dir: 'ltr' },
      { text: '5 questions' },
    ]);
    expect(summaryParts('stories', { length: 'long' }, t)).toEqual([{ text: 'Long' }]);
  });
});

describe('recent friends', () => {
  it('keeps the newest first, each once, and no more than eight', () => {
    rememberFriends(['a', 'b']);
    rememberFriends(['c', 'a']);
    expect(recentFriends()).toEqual(['c', 'a', 'b']);
    rememberFriends(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(recentFriends()).toHaveLength(8);
  });

  it('is empty on a device that will not remember, or that remembered nonsense', () => {
    localStorage.setItem('hevalo.play.recent', '{"not":"a list"}');
    expect(recentFriends()).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberFriends(['a'])).not.toThrow();
  });
});
