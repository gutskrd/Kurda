import { describe, expect, it } from 'vitest';
import { formatJoinCode, PLAY_GAMES } from '@kurda/shared';
import { contrastRatio } from '../a11y/contrast';
import { DARK, LIGHT } from '../theme/palette';
import { codePath, codeTone, joinCodeError, shareMessage, spelledCode, typedCode } from './joinCode';

// the keys, with what was put into them, so a test reads what a person would be told
const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe('typedCode', () => {
  it('upper-cases what is typed and keeps it to six', () => {
    expect(typedCode('a')).toBe('A');
    expect(typedCode('abc2')).toBe('ABC2');
    expect(typedCode('abc2345')).toBe('ABC234');
  });

  it('reads a code pasted with spaces, dashes or in lower case', () => {
    expect(typedCode('ABC 234')).toBe('ABC234');
    expect(typedCode('abc-234')).toBe('ABC234');
    expect(typedCode(' ab c2 34 ')).toBe('ABC234');
  });

  it('reads the digits an Arabic or a Soranî keyboard types', () => {
    expect(typedCode('abc٢٣٤')).toBe('ABC234');
    expect(typedCode('abc۲۳۴')).toBe('ABC234');
  });

  it('drops what a code cannot contain, the look-alikes among them', () => {
    expect(typedCode('A0O1IL')).toBe('A');
    expect(typedCode('AB!C')).toBe('ABC');
    expect(typedCode('ê')).toBe('');
  });

  it('takes the code out of a whole message pasted in, not the first capitals of it', () => {
    expect(typedCode('Play Pêşbaziya Peyvan with me on Hevalo! Open Games → Join with a code and type ABC 234')).toBe('ABC234');
    expect(typedCode('لە Hevalo لەگەڵم یاری بکە! یارییەکان ← بە کۆد بەشداربە بکەرەوە و XYZ 789 بنووسە')).toBe('XYZ789');
    expect(typedCode('Hevalo’da benimle oyna! ABC-234 yaz')).toBe('ABC234');
  });

  it('reads the code out of the whole invitation, link and all', () => {
    const invitation = 'Play Xapînok with me on Hevalo! Open Games → Join with a code and type ABC 234\nOr tap to join: https://hevalo.app/join/impostor/ABC234?from=0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f';
    expect(typedCode(invitation)).toBe('ABC234');
    expect(typedCode('Li Hevaloyê bi min re bilîze! Lîstik → Bi kodekê beşdar bibe veke û XYZ 789 binivîse\nAn jî li girêdanê bixe û beşdar bibe: https://hevalo.app/join/who-am-i/XYZ789')).toBe('XYZ789');
  });

  it('does not grow past six when a seventh character is typed onto a whole code', () => {
    expect(typedCode('ABC2345')).toBe('ABC234');
  });
});

describe('the words round a code', () => {
  it('spells a code out for a screen reader', () => {
    expect(spelledCode('ABC234')).toBe('A B C 2 3 4');
  });

  it('says where a friend types it, with the arrow pointing the way the language reads', () => {
    expect(codePath(t, false)).toBe('learn.view.games → stories.join.open');
    expect(codePath(t, true)).toBe('learn.view.games ← stories.join.open');
  });

  it('shares the code as it is read out, with where to type it and no link', () => {
    const game = shareMessage({ game: 'Pêşbaziya Peyvan', code: 'ABC234' }, t, false, formatJoinCode);
    expect(game).toBe('play.code.shareText {"code":"ABC 234","path":"learn.view.games → stories.join.open","game":"Pêşbaziya Peyvan"}');
    const story = shareMessage({ game: 'Stories', code: 'ABC234', storyTitle: 'Nanê Germ' }, t, false, formatJoinCode);
    expect(story).toContain('play.code.shareStory');
    expect(story).toContain('"title":"Nanê Germ"');
    expect(`${game}${story}`).not.toMatch(/https?:|\/app\/games/);
  });
});

describe('joinCodeError', () => {
  const error = (over: Record<string, unknown>) => ({ kind: 'client' as const, message: '', status: 400, ...over });

  it('says what each refusal means, and what to do next', () => {
    expect(joinCodeError(error({ status: 404, code: 'GAME_NOT_FOUND' }), t as never)).toBe('play.join.notFound');
    expect(joinCodeError(error({ status: 409, code: 'GAME_FULL' }), t as never)).toBe('stories.join.full');
    expect(joinCodeError(error({ status: 409, code: 'GAME_STARTED' }), t as never)).toBe('stories.join.started');
    expect(joinCodeError(error({ kind: 'rate_limited', status: 429, retryAfterSec: 41 }), t as never)).toBe('play.join.tooMany');
  });

  it('leaves anything else to the app’s usual words', () => {
    expect(joinCodeError(error({ kind: 'network', status: 0 }), t as never)).toBe('error.offline');
    expect(joinCodeError(error({ kind: 'server', status: 500 }), t as never)).toBe('error.server');
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
