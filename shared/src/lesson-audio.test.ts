import { describe, expect, it } from 'vitest';
import { lessonAudioKey, lessonAudioTargets, primaryAudioTarget } from './lesson-audio.js';

// explicit code points, so precomposed and decomposed are unambiguous
const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302);
const S_CEDILLA_DECOMPOSED = 's' + String.fromCharCode(0x327);

describe('lessonAudioKey', () => {
  it('is the same key for the same sentence however it is typed', () => {
    const key = lessonAudioKey('Ez baş im');
    expect(key).toBe('ez baş im');
    expect(lessonAudioKey('  ez   BAŞ im. ')).toBe(key);
    expect(lessonAudioKey('Ez baş im!')).toBe(key);
    expect(lessonAudioKey('Ez baş im?!…')).toBe(key);
    expect(lessonAudioKey('“Ez baş im.”')).toBe(key);
    expect(lessonAudioKey('"Ez baş im".')).toBe(key);
  });

  it('keeps Kurmanji diacritics: sêv and sev are different words', () => {
    expect(lessonAudioKey('Sêv')).toBe('sêv');
    expect(lessonAudioKey('Sêv')).not.toBe(lessonAudioKey('Sev'));
    expect(lessonAudioKey('ŞÎR')).toBe('şîr');
    expect(lessonAudioKey('Çav û Guh')).toBe('çav û guh');
  });

  it('treats decomposed diacritics like precomposed ones', () => {
    expect(lessonAudioKey(`${S_CEDILLA_DECOMPOSED}${E_CIRC_DECOMPOSED}v`)).toBe(lessonAudioKey('şêv'));
  });

  it('folds a Turkish keyboard’s ı and İ into Hawar’s i', () => {
    expect(lessonAudioKey('bıra')).toBe('bira');
    expect(lessonAudioKey('İro')).toBe(lessonAudioKey('Iro'));
  });

  it('keys Soranî in Arabic script, with its own question mark and full stop', () => {
    expect(lessonAudioKey('چۆنی؟')).toBe('چۆنی');
    expect(lessonAudioKey('سوپاس.')).toBe('سوپاس');
    expect(lessonAudioKey('ئەمە کتێبە۔')).toBe('ئەمە کتێبە');
    expect(lessonAudioKey('  من   باشم ، ')).toBe('من باشم');
  });

  it('folds the Arabic kaf, yeh and heh into the Kurdish letters', () => {
    // كوڕ with Arabic kaf (U+0643) is the Kurdish کوڕ
    expect(lessonAudioKey('كوڕ')).toBe(lessonAudioKey('کوڕ'));
    expect(lessonAudioKey('ماسي')).toBe(lessonAudioKey('ماسی'));
    expect(lessonAudioKey('هاوڕێ')).toBe(lessonAudioKey('ھاوڕێ'));
  });

  it('drops invisible characters that ride in on a copy and paste', () => {
    expect(lessonAudioKey('‏سوپاس‏')).toBe('سوپاس');
    expect(lessonAudioKey('Sp​as')).toBe('spas');
    expect(lessonAudioKey('﻿Silav')).toBe('silav');
    // the tatweel only stretches a letter
    expect(lessonAudioKey('سوپـــاس')).toBe('سوپاس');
  });

  it('keeps the zero-width non-joiner, which changes the letter in older Soranî spelling', () => {
    expect(lessonAudioKey('ده‌ست')).not.toBe(lessonAudioKey('دهست'));
  });

  it('is empty when there is nothing to say', () => {
    expect(lessonAudioKey('')).toBe('');
    expect(lessonAudioKey('   ')).toBe('');
    expect(lessonAudioKey('?!')).toBe('');
    expect(lessonAudioKey('“”')).toBe('');
  });

  it('leaves punctuation inside a sentence alone', () => {
    expect(lessonAudioKey('Silav, tu çawa yî?')).toBe('silav, tu çawa yî');
  });
});

describe('lessonAudioTargets', () => {
  it('takes the first accepted answer of translate, writing and listening', () => {
    expect(lessonAudioTargets('translate', { prompt: 'Thank you', accepted: ['Spas', 'Spas dikim'] })).toEqual(['Spas']);
    expect(lessonAudioTargets('writing', { prompt: 'Write it', accepted: ['Ez xwendekar im'] })).toEqual(['Ez xwendekar im']);
    expect(lessonAudioTargets('listening', { accepted: ['sêv'] })).toEqual(['sêv']);
  });

  it('takes the reference of a speaking item', () => {
    expect(lessonAudioTargets('speaking', { prompt: 'Say: hello', reference: 'Silav' })).toEqual(['Silav']);
  });

  it('takes every left-hand card of match-pairs, as written', () => {
    const payload = {
      pairs: [
        { left: 'Silav', right: 'Hello' },
        { left: 'Spas', right: 'Thanks' },
        { left: 'Erê', right: 'Yes' },
      ],
    };
    expect(lessonAudioTargets('match_pairs', payload)).toEqual(['Silav', 'Spas', 'Erê']);
  });

  it('asks nothing of a multiple-choice item unless it says what to say', () => {
    const payload = { prompt: '"Hello" bi kurdî?', options: ['Silav', 'Spas', 'Na'], correctIndex: 0 };
    expect(lessonAudioTargets('multiple_choice', payload)).toEqual([]);
    expect(lessonAudioTargets('multiple_choice', { ...payload, say: 'Silav' })).toEqual(['Silav']);
  });

  it('puts `say` first, on any type', () => {
    expect(lessonAudioTargets('translate', { prompt: 'x', accepted: ['Spas dikim'], say: 'Spas' })).toEqual(['Spas', 'Spas dikim']);
    expect(lessonAudioTargets('match_pairs', { pairs: [{ left: 'av', right: 'water' }, { left: 'nan', right: 'bread' }], say: 'Av û nan' })).toEqual([
      'Av û nan',
      'av',
      'nan',
    ]);
  });

  it('lists a text once even when it appears twice, keeping the first spelling', () => {
    expect(lessonAudioTargets('translate', { prompt: 'x', accepted: ['spas.'], say: 'Spas' })).toEqual(['Spas']);
    expect(
      lessonAudioTargets('match_pairs', {
        pairs: [
          { left: 'Av', right: 'water' },
          { left: 'av!', right: 'water!' },
        ],
      }),
    ).toEqual(['Av']);
  });

  it('works for Soranî items', () => {
    expect(lessonAudioTargets('translate', { prompt: 'Thank you', accepted: ['سوپاس'] })).toEqual(['سوپاس']);
    expect(lessonAudioTargets('multiple_choice', { prompt: '?', options: ['a', 'b'], correctIndex: 0, say: 'چۆنی؟' })).toEqual(['چۆنی؟']);
  });

  it('skips texts with nothing to say, and never throws on malformed content', () => {
    expect(lessonAudioTargets('translate', { prompt: 'x', accepted: ['?'] })).toEqual([]);
    expect(lessonAudioTargets('translate', { prompt: 'x', accepted: 'Spas' })).toEqual([]);
    expect(lessonAudioTargets('match_pairs', { pairs: [null, { left: 3 }, { left: 'av' }] })).toEqual(['av']);
    expect(lessonAudioTargets('speaking', null)).toEqual([]);
    expect(lessonAudioTargets('mystery', { say: 'Silav' })).toEqual(['Silav']);
    expect(lessonAudioTargets('translate', { say: 42, accepted: ['av'] })).toEqual(['av']);
  });
});

describe('primaryAudioTarget', () => {
  it('prefers `say`', () => {
    expect(primaryAudioTarget('translate', { prompt: 'x', accepted: ['Spas dikim'], say: 'Spas' })).toBe('Spas');
    expect(primaryAudioTarget('multiple_choice', { prompt: 'x', options: ['a', 'b'], correctIndex: 0, say: 'Roj baş' })).toBe('Roj baş');
    expect(primaryAudioTarget('match_pairs', { pairs: [], say: 'Av' })).toBe('Av');
  });

  it('falls back to the answer, the transcription or the reference', () => {
    expect(primaryAudioTarget('translate', { prompt: 'x', accepted: ['Spas', 'Spas dikim'] })).toBe('Spas');
    expect(primaryAudioTarget('writing', { prompt: 'x', accepted: ['bavê min'] })).toBe('bavê min');
    expect(primaryAudioTarget('listening', { accepted: ['سوپاس'] })).toBe('سوپاس');
    expect(primaryAudioTarget('speaking', { prompt: 'x', reference: 'Silav' })).toBe('Silav');
  });

  it('is null for match-pairs and for multiple choice without `say`', () => {
    expect(primaryAudioTarget('match_pairs', { pairs: [{ left: 'av', right: 'water' }] })).toBeNull();
    expect(primaryAudioTarget('multiple_choice', { prompt: 'x', options: ['Silav', 'Na'], correctIndex: 0 })).toBeNull();
  });

  it('ignores a `say` with nothing in it', () => {
    expect(primaryAudioTarget('translate', { prompt: 'x', accepted: ['Spas'], say: ' ? ' })).toBe('Spas');
    expect(primaryAudioTarget('speaking', {})).toBeNull();
  });
});
