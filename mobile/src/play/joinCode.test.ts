import { describe, expect, it } from 'vitest';
import { formatJoinCode, PLAY_GAMES } from '@kurda/shared';
import { contrastRatio } from '../a11y/contrast';
import { DARK, LIGHT } from '../theme/palette';
import { codePath, codeTone, shareMessage, spelledCode } from './joinCode';

// the keys, with what was put into them, so a test reads what a person would be told
const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe('the words round a code', () => {
  it('spells a code out for a screen reader', () => {
    expect(spelledCode('ABC234')).toBe('A B C 2 3 4');
  });

  it('says where a friend types it, with the arrow pointing the way the language reads', () => {
    expect(codePath(t, false)).toBe('learn.view.games → stories.join.open');
    expect(codePath(t, true)).toBe('learn.view.games ← stories.join.open');
  });

  it('shares the code as it is read out, with where to type it and no link', () => {
    const game = shareMessage({ game: 'Peyvok Battle', code: 'ABC234' }, t, false, formatJoinCode);
    expect(game).toBe('play.code.shareText {"code":"ABC 234","path":"learn.view.games → stories.join.open","game":"Peyvok Battle"}');
    const story = shareMessage({ game: 'Stories', code: 'ABC234', storyTitle: 'Nanê Germ' }, t, false, formatJoinCode);
    expect(story).toContain('play.code.shareStory');
    expect(story).toContain('"title":"Nanê Germ"');
    expect(`${game}${story}`).not.toMatch(/https?:|\/app\/games/);
  });
});

describe('codeTone', () => {
  it('draws each game’s code in its own colour, with letters that read on it in both themes', () => {
    for (const palette of [LIGHT, DARK]) {
      const faces = PLAY_GAMES.map((game) => codeTone(palette, game).face);
      // three games, three colours
      expect(new Set(faces).size).toBe(3);
      for (const game of PLAY_GAMES) {
        const tone = codeTone(palette, game);
        expect(contrastRatio(tone.ink, tone.face), `${palette.scheme} ${game}`).toBeGreaterThanOrEqual(4.5);
        expect(tone.lip).not.toBe(tone.face);
      }
    }
    expect(codeTone(LIGHT, 'wordle-battle').face).toBe(LIGHT.success);
    expect(codeTone(LIGHT, 'rhyme-match').face).toBe(LIGHT.gold);
    expect(codeTone(LIGHT, 'stories').face).toBe(LIGHT.primary);
  });
});
