import { describe, expect, it } from 'vitest';
import { KURMANJI_KEYS, SORANI_KEYS } from './lesson-answers.js';
import {
  ACCENT_MODES,
  DEFAULT_ACCENT_MODE,
  KEYBOARD_GUIDES,
  KEYBOARD_PLATFORMS,
  KURMANCI_ALPHABET,
  KURMANCI_SPECIAL,
  SORANI_SPECIAL,
  TYPING_WINDOW,
  applyBacktickShortcut,
  compareTyping,
  detectKeyboardPlatform,
  displayTarget,
  findUntypeable,
  foldAccent,
  isAccentMode,
  isTypeable,
  keyboardStepText,
  kurmanciLetter,
  normalizeTyping,
  scriptDialect,
  specialKeys,
  typingDialectOf,
  typingLanguage,
  type CharState,
  type TypingComparison,
} from './typing.js';

/** The marks as one string, so a test can show what a racer would see: o a X . */
function marks(r: TypingComparison): string {
  const glyph: Record<CharState, string> = { ok: 'o', accent: 'a', wrong: 'X', pending: '.' };
  return r.chars.map((c) => glyph[c]).join('');
}

const TEXT = 'ez ji welatê xwe hez dikim'; // 26 characters, one accent

/** A Stories text (kmr-barana-newroze), as written: paragraphs, curly quotes; 993 characters normalised. */
const NEWROZ =
  'Sibeha Newrozê Berfîn zû şiyar bû. Wê kirasê xwe yê nû û kesk li xwe kir. Diya wê di metbexê de dolme ' +
  'çêdikir. Malbatê dixwest wê rojê biçe seyranê, li Girê Kulîlkan, nêzî bajêr.\n\nLê gava Berfînê ji pencereyê ' +
  'li derve nêrî, dilê wê şikest. Baran dibariya û ewr reş bûn. Berfînê dest bi girî kir û got: “Êdî em naçin ' +
  'seyranê!”\n\nBapîrê wê hat û li kêleka wê rûnişt. Wî got: “Keça min, baran bereket e. Bihar bi baranê tê. ' +
  'Heta nîvro bisekine.”\n\nBapîr rast derket. Nêzî nîvro baran sekinî û roj derket. Wan bi lez çay û xwarin ' +
  'hilgirtin. Paşê ew hemû bi hev re çûn Girê Kulîlkan.\n\nLi Girê Kulîlkan her der kesk bû. Kulîlkên zer û sor ' +
  'vebûbûn. Bi sedan mirov hatibûn. Hinekan def û zirne lêdixistin, hinekan jî govend digirt. Berfînê destê ' +
  'Bapîrê xwe girt û herdu ketin nav govendê.\n\nÊvarê agirê Newrozê hat vêxistin. Ciwanan yek bi yek xwe di ser ' +
  'agir re avêt. Berfîn û Bapîr li ber agir rûniştin. Berfînê got: “Bapîro, te rast got. Baran bereket e!” ' +
  'Bapîr kenî û got: “Newroza te pîroz be, keça min.”';

describe('normalizeTyping', () => {
  it('composes a decomposed letter, so e + U+0302 is the ê every keyboard sends', () => {
    expect(normalizeTyping('welate\u0302')).toBe('welatê');
    expect([...normalizeTyping('welate\u0302')]).toHaveLength(6);
  });

  it('reads the Turkish ı and İ as the i and I of Hawar', () => {
    expect(normalizeTyping('ızın')).toBe('izin');
    expect(normalizeTyping('İro')).toBe('Iro');
    // what 'İ'.toLowerCase() leaves behind: i and a combining dot
    expect(normalizeTyping('İ'.toLowerCase())).toBe('i');
  });

  it('straightens curly quotes, guillemets, dashes and the ellipsis', () => {
    expect(normalizeTyping('Ez’ê bêm — sibê…')).toBe("Ez'ê bêm - sibê...");
    expect(normalizeTyping('“baş” «baş» ‘a’ – b')).toBe('"baş" "baş" \'a\' - b');
  });

  it('makes every run of spaces, tabs, line breaks and no-break spaces one space, and trims', () => {
    expect(normalizeTyping('  ez\u00a0ji\t\twelat\n\nxwe\u202f  ')).toBe('ez ji welat xwe');
  });

  it('removes invisible formatting and tatweel', () => {
    expect(normalizeTyping('we\u200blat\u200f')).toBe('welat');
    expect(normalizeTyping('\u202bکوردی\u202c')).toBe('کوردی');
    expect(normalizeTyping('ک\u0640\u0640\u0640ورد', 'sorani')).toBe('کورد');
  });

  it('writes Soranî lookalikes as the Kurdish letter', () => {
    // arabic kaf and yeh, and alef maksura, as keheh and farsi yeh
    expect(normalizeTyping('كتيب', 'sorani')).toBe('کتیب');
    expect(normalizeTyping('ى', 'sorani')).toBe('ی');
    // ۀ, and ه + zero-width non-joiner (a Persian keyboard's ە), as ە
    expect(normalizeTyping('ۀ', 'sorani')).toBe('ە');
    expect(normalizeTyping('به\u200cرد', 'sorani')).toBe('بەرد');
  });

  it('reads what copying leaves behind as the letters it stands for', () => {
    // کوردی copied out of a PDF: every letter its shaped presentation form
    const fromPdf = 'ﻛﻮﺭﺩﯼ';
    expect(normalizeTyping(fromPdf, 'sorani')).toBe('کوردی');
    expect(findUntypeable(fromPdf, 'sorani')).toEqual([]);
    // a Latin ligature and full-width letters
    expect(normalizeTyping('ﬁlm Ａｂ', 'kurmanci')).toBe('film Ab');
    // and a race typed against such a text is typed on an ordinary keyboard
    expect(compareTyping(fromPdf, 'کوردی', 'strict', { dialect: 'sorani', final: true })).toMatchObject({
      correct: 5,
      errors: 0,
      done: true,
    });
  });

  it('keeps ه as written, since some texts spell the vowel with it', () => {
    expect(normalizeTyping('خانه', 'sorani')).toBe('خانه');
  });

  it('writes digits the way the variety does', () => {
    expect(normalizeTyping('٢٠٢٤ ۲۰۲۴', 'sorani')).toBe('٢٠٢٤ ٢٠٢٤');
    expect(normalizeTyping('٢٠٢٤ ۲۰۲۴', 'kurmanci')).toBe('2024 2024');
    expect(normalizeTyping('çawa yî؟', 'kurmanci')).toBe('çawa yî?');
    expect(normalizeTyping('چۆنی؟', 'sorani')).toBe('چۆنی؟');
  });

  it('keeps case and accents: they are the comparison’s business', () => {
    expect(normalizeTyping('Ê ê E e')).toBe('Ê ê E e');
  });

  it('keeps one trailing space while the text is still being typed', () => {
    expect(normalizeTyping('  ez ji  ', 'kurmanci', { partial: true })).toBe('ez ji ');
    expect(normalizeTyping('ez ji\u00a0', 'kurmanci', { partial: true })).toBe('ez ji ');
  });

  it('is idempotent', () => {
    const samples = ['Ez’ê bêm — sibê…', 'welate\u0302  ız', 'به\u200cرد كتيب ٢', ' “x” ', '\ufedb\ufeee \ufb01 \uff21'];
    for (const s of samples) {
      for (const dialect of ['kurmanci', 'sorani'] as const) {
        const once = normalizeTyping(s, dialect);
        expect(normalizeTyping(once, dialect)).toBe(once);
      }
    }
  });
});

describe('the varieties and their keys', () => {
  it('maps a variety to the language code race texts are stored under, and back', () => {
    expect(typingLanguage('kurmanci')).toBe('kmr');
    expect(typingLanguage('sorani')).toBe('ckb');
    expect(typingDialectOf('ckb')).toBe('sorani');
    expect(typingDialectOf('Soranî')).toBe('sorani');
    expect(typingDialectOf('kmr')).toBe('kurmanci');
    expect(typingDialectOf(null)).toBe('kurmanci');
  });

  it('reads the variety a text is written in from its script', () => {
    expect(scriptDialect('ڕۆژێکی خۆش بوو، چووینە باخچەکە.')).toBe('sorani');
    expect(scriptDialect('Ez ji welatê xwe hez dikim.')).toBe('kurmanci');
    // a Soranî text copied out of a PDF, in presentation forms
    expect(scriptDialect('ﻛﻮﺭﺩ')).toBe('sorani');
    // mostly one script with a word of the other is still that one
    expect(scriptDialect('Ez dibêjim کوردی, ne tiştekî din.')).toBe('kurmanci');
    expect(scriptDialect('من دەڵێم Kurdî')).toBe('sorani');
    // nothing to go by: digits and marks, or as many letters of each
    expect(scriptDialect('12 - 34 ... 56 !')).toBeNull();
    expect(scriptDialect('ab سڵ')).toBeNull();
    // × and ÷ share the Latin block but are not letters
    expect(scriptDialect('سڵ ×÷×')).toBe('sorani');
  });

  it('offers the five Kurmancî letters in alphabet order — the lesson key bar’s letters', () => {
    expect(KURMANCI_SPECIAL).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
    expect([...KURMANCI_SPECIAL].sort()).toEqual([...KURMANJI_KEYS].sort());
    expect(SORANI_SPECIAL).toBe(SORANI_KEYS);
    expect(specialKeys('sorani')).toContain('ڕ');
    expect(specialKeys('kurmanci')).toBe(KURMANCI_SPECIAL);
  });

  it('has the 31 letters of the Kurmancî alphabet', () => {
    expect(KURMANCI_ALPHABET).toHaveLength(31);
    for (const ch of KURMANCI_SPECIAL) expect(KURMANCI_ALPHABET).toContain(ch);
  });
});

describe('kurmanciLetter (Wordle’s physical keyboard)', () => {
  it('reads the character a key produced, whatever modifier made it', () => {
    expect(kurmanciLetter('a')).toBe('a');
    expect(kurmanciLetter('Ş')).toBe('ş'); // Shift
    expect(kurmanciLetter('ç')).toBe('ç'); // Option+c on a Mac, AltGr on Windows
    expect(kurmanciLetter('e\u0302')).toBe('ê'); // a dead key that sent the parts
    expect(kurmanciLetter('ı')).toBe('i'); // the Turkish Q i key
    expect(kurmanciLetter('İ')).toBe('i');
    expect(kurmanciLetter('X')).toBe('x');
  });

  it('is null for anything that is not a letter of the alphabet', () => {
    for (const key of ['Enter', 'Backspace', 'Dead', ' ', '1', 'é', 'ö', 'ß', 'ک', '']) {
      expect(kurmanciLetter(key)).toBeNull();
    }
  });
});

describe('accent modes', () => {
  it('are strict, forgiving and hidden, forgiving by default', () => {
    expect(ACCENT_MODES).toEqual(['strict', 'forgiving', 'hidden']);
    expect(DEFAULT_ACCENT_MODE).toBe('forgiving');
    expect(isAccentMode('hidden')).toBe(true);
    expect(isAccentMode('lazy')).toBe(false);
  });

  it('fold the Kurmancî accents and the Soranî pairs, and nothing else', () => {
    expect([...'çêîşûÇÊÎŞÛ'].map(foldAccent).join('')).toBe('ceisuCEISU');
    expect(['ێ', 'ۆ', 'ڕ', 'ڵ'].map(foldAccent)).toEqual(['ی', 'و', 'ر', 'ل']);
    expect(foldAccent('ە')).toBe('ە');
    expect(foldAccent('é')).toBe('é');
  });

  it('show the text without accents in hidden mode, one character for one', () => {
    expect(displayTarget(TEXT, 'hidden')).toBe('ez ji welate xwe hez dikim');
    expect(displayTarget(TEXT, 'forgiving')).toBe(TEXT);
    expect(displayTarget('Ez’ê', 'strict')).toBe("Ez'ê");
    expect([...displayTarget(TEXT, 'hidden')]).toHaveLength([...TEXT].length);
  });
});

describe('compareTyping', () => {
  it('marks a perfect run', () => {
    const r = compareTyping(TEXT, TEXT, 'strict', { final: true });
    expect(marks(r)).toBe('o'.repeat(26));
    expect(r).toMatchObject({ correct: 26, errors: 0, accentMisses: 0, accented: 1, done: true, caret: 26 });
    expect(r.extra).toEqual([]);
  });

  /*
   * The race's worst bug: positions were compared one by one, so a racer who
   * missed the first letter scored 0 of 26.
   */
  it('one missed letter costs that letter, never the rest of the text', () => {
    const r = compareTyping(TEXT, TEXT.slice(1), 'strict', { final: true });
    expect(marks(r)).toBe('X' + 'o'.repeat(25));
    expect(r.correct).toBe(25);
    expect(r.errors).toBe(1);
  });

  it('one letter typed twice is one mistake, shown where it was typed', () => {
    const r = compareTyping(TEXT, 'ez ji wellatê xwe hez dikim', 'strict', { final: true });
    expect(r.correct).toBe(26);
    expect(r.errors).toBe(1);
    expect(r.extra).toEqual([{ before: 8, text: 'l' }]);
  });

  it('a missing letter in the middle spoils only its own word', () => {
    const r = compareTyping(TEXT, 'ez ji wlatê xwe hez dikim', 'strict', { final: true });
    expect(marks(r)).toBe('oooooooXoooooooooooooooooo');
    expect(r.correct).toBe(25);
  });

  it('a space typed inside a word, or left out between two, is one mistake too', () => {
    const extra = compareTyping(TEXT, 'ez ji wel atê xwe hez dikim', 'strict', { final: true });
    expect(extra.correct).toBe(26);
    expect(extra.errors).toBe(1);
    expect(extra.extra).toEqual([{ before: 9, text: ' ' }]);

    const missing = compareTyping(TEXT, 'ez jiwelatê xwe hez dikim', 'strict', { final: true });
    expect(marks(missing)).toBe('oooooXoooooooooooooooooooo');
    expect(missing.correct).toBe(25);
  });

  it('a wrong letter is wrong, and the letters around it are not', () => {
    const r = compareTyping(TEXT, 'ez ji welatê xwe hez dikin', 'strict', { final: true });
    expect(marks(r)).toBe('o'.repeat(25) + 'X');
    expect(r.errors).toBe(1);
  });

  it('a decomposed text is typed perfectly on a keyboard that sends ê', () => {
    // the race text was saved as e + U+0302; every keyboard types the one code point
    const r = compareTyping('ez ji welate\u0302 xwe', 'ez ji welatê xwe', 'strict', { final: true });
    expect(r.chars).toHaveLength(16);
    expect(r.correct).toBe(16);
    expect(r.done).toBe(true);
    expect(r.errors).toBe(0);
  });

  it('a curly apostrophe, a dash and a no-break space in the text cost nothing', () => {
    const r = compareTyping('Ez’ê bêm — sibê\u00a0were.', "Ez'ê bêm - sibê were.", 'strict', { final: true });
    expect(r.errors).toBe(0);
    expect(r.done).toBe(true);
    // a double space typed is one space
    expect(compareTyping('ez ji welat', 'ez  ji welat', 'strict', { final: true }).errors).toBe(0);
  });

  it('a Turkish keyboard’s ı is an i', () => {
    expect(compareTyping('dibistan', 'dıbıstan', 'strict', { final: true }).errors).toBe(0);
  });

  describe('accents', () => {
    const plain = 'ez ji welate xwe hez dikim';

    it('strict: ê typed as e is wrong, and counted as an accent missed', () => {
      const r = compareTyping(TEXT, plain, 'strict', { final: true });
      expect(r.chars[11]).toBe('wrong');
      expect(r).toMatchObject({ correct: 25, errors: 1, accentMisses: 1, accented: 1 });
    });

    it('forgiving: ê typed as e counts, and the missed accent is still counted', () => {
      const r = compareTyping(TEXT, plain, 'forgiving', { final: true });
      expect(r.chars[11]).toBe('accent');
      expect(r).toMatchObject({ correct: 26, errors: 0, accentMisses: 1, accented: 1, done: true });
    });

    it('hidden: no accents shown and none compared', () => {
      const r = compareTyping(TEXT, plain, 'hidden', { final: true });
      expect(marks(r)).toBe('o'.repeat(26));
      expect(r).toMatchObject({ correct: 26, errors: 0, accentMisses: 0, accented: 0 });
      // typing the accent anyway is right as well
      expect(compareTyping(TEXT, TEXT, 'hidden', { final: true }).correct).toBe(26);
    });

    /*
     * Forgiving forgives the key a keyboard lacks — e typed for ê — and nothing
     * else: an accent added where the text has none is a different letter. It
     * used to be forgiven too, and counted as an accent missed on a letter that
     * has no accent ("1 missed of 0").
     */
    it('forgiving does not forgive an accent added where the text has none', () => {
      const r = compareTyping('Ez de herim.', 'Ez dê herim.', 'forgiving', { final: true });
      expect(r.chars[4]).toBe('wrong');
      expect(r).toMatchObject({ correct: 11, errors: 1, accentMisses: 0, accented: 0 });
      // ş for s, and in Soranî ێ for ی, the same
      expect(compareTyping('ser', 'şer', 'forgiving', { final: true }).chars[0]).toBe('wrong');
      const sorani = compareTyping('بیر', 'بێر', 'forgiving', { dialect: 'sorani', final: true });
      expect(sorani).toMatchObject({ correct: 2, errors: 1, accentMisses: 0, accented: 0 });
      // hidden shows no accents, so an accent typed anyway is still the letter
      expect(compareTyping('Ez de herim.', 'Ez dê herim.', 'hidden', { final: true }).errors).toBe(0);
    });

    it('never counts more accents missed than accented letters reached', () => {
      // a seeded run of typings built from the text's own letters, accents
      // added and dropped, letters skipped and doubled
      const text = 'Ez ji welatê xwe hez dikim, şîr û çay.';
      const swap: Record<string, string> = { e: 'ê', ê: 'e', i: 'î', î: 'i', u: 'û', û: 'u', s: 'ş', ş: 's', c: 'ç', ç: 'c' };
      let seed = 7;
      const random = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let run = 0; run < 300; run++) {
        let typed = '';
        for (const ch of text) {
          const roll = random();
          if (roll < 0.25 && swap[ch]) typed += swap[ch];
          else if (roll < 0.3) continue;
          else if (roll < 0.35) typed += ch + ch;
          else typed += ch;
        }
        for (const mode of ACCENT_MODES) {
          for (const final of [true, false]) {
            const r = compareTyping(text, typed, mode, { final });
            expect(r.accentMisses, `${mode} ${typed}`).toBeLessThanOrEqual(r.accented);
            expect(r.correct + r.chars.filter((c) => c === 'wrong').length).toBeLessThanOrEqual(r.chars.length);
          }
        }
      }
    });

    it('forgiving and hidden never forgive a different letter', () => {
      for (const mode of ['forgiving', 'hidden'] as const) {
        const r = compareTyping(TEXT, 'ez ji welata xwe hez dikim', mode, { final: true });
        expect(r.chars[11]).toBe('wrong');
        expect(r.correct).toBe(25);
      }
    });

    it('forgiving folds the Soranî pairs: ی for ێ, و for ۆ, ر for ڕ, ل for ڵ', () => {
      const target = 'ڕێگا ۆ گوڵ';
      const typed = 'ریگا و گول';
      const r = compareTyping(target, typed, 'forgiving', { dialect: 'sorani', final: true });
      expect(r).toMatchObject({ correct: 10, errors: 0, accentMisses: 4 });
      expect(compareTyping(target, typed, 'strict', { dialect: 'sorani', final: true }).errors).toBe(4);
    });

    it('reads ھ and ه as the same h, and keeps ە apart', () => {
      expect(compareTyping('ھەر', 'هەر', 'strict', { dialect: 'sorani', final: true }).errors).toBe(0);
      expect(compareTyping('ھەر', 'ھھر', 'strict', { dialect: 'sorani', final: true }).errors).toBe(1);
    });

    it('takes a Soranî text typed on an Arabic keyboard', () => {
      expect(compareTyping('کتێب', 'كتێب', 'strict', { dialect: 'sorani', final: true }).errors).toBe(0);
    });
  });

  describe('while typing', () => {
    it('leaves what is not reached pending, with the caret where the next letter goes', () => {
      const r = compareTyping(TEXT, 'ez ji');
      expect(marks(r)).toBe('ooooo' + '.'.repeat(21));
      expect(r).toMatchObject({ correct: 5, errors: 0, done: false, caret: 5 });
    });

    it('counts the space that ends a word', () => {
      const r = compareTyping(TEXT, 'ez ji ');
      expect(r.correct).toBe(6);
      expect(r.caret).toBe(6);
    });

    it('moves the caret on with each key, as on any typing test', () => {
      // x is the wrong key for the space, or one key too many: read as the first
      const r = compareTyping('ab cd', 'abx', 'strict');
      expect(marks(r)).toBe('ooX..');
      expect(r.caret).toBe(3);
      // and the next keys settle it
      const more = compareTyping('ab cd', 'abx cd', 'strict');
      expect(marks(more)).toBe('ooooo');
      expect(more.extra).toEqual([{ before: 2, text: 'x' }]);
    });

    it('reads a skipped letter as skipped, not every letter after it as wrong', () => {
      // "wl": the e was left out and the l is right, rather than l typed for e
      const r = compareTyping(TEXT, 'ez ji wl');
      expect(marks(r)).toBe('oooooooXo' + '.'.repeat(17));
      expect(r.caret).toBe(9);
    });

    it('is done once the end of the text is reached, mistakes or not', () => {
      expect(compareTyping(TEXT, TEXT).done).toBe(true);
      expect(compareTyping(TEXT, 'ez ji welatê xwe hez dikin').done).toBe(true);
      expect(compareTyping(TEXT, 'ez ji welatê xwe hez diki').done).toBe(false);
    });

    /*
     * A text ending in î ended the race the moment the dead key's ˆ arrived,
     * before the i did, and scored the last letter wrong.
     */
    it('is not done while a dead key is still waiting for its letter', () => {
      for (const dead of ['ˆ', '^', '¨', '´', '`', '\u0302']) {
        const r = compareTyping('ez kurd im, ne kurdî', `ez kurd im, ne kurd${dead}`, 'strict');
        expect(r.done, dead).toBe(false);
        expect(r.chars.at(-1), dead).toBe('pending');
        expect(r.errors, dead).toBe(0);
      }
    });

    it('in strict mode, e where ê belongs is pending as the last key: a backtick may follow', () => {
      const r = compareTyping(TEXT, 'ez ji welate', 'strict');
      expect(r.chars[11]).toBe('pending');
      expect(r.errors).toBe(0);
      expect(r.caret).toBe(12);
      expect(r.awaitingBacktick).toBe(true);
      // the next key decides it
      const wrong = compareTyping(TEXT, 'ez ji welate ', 'strict');
      expect(wrong.chars[11]).toBe('wrong');
      expect(wrong.awaitingBacktick).toBe(false);
      expect(compareTyping(TEXT, applyBacktickShortcut('ez ji welate', '`'), 'strict').chars[11]).toBe('ok');
      // and a text that ends on it is not done yet
      expect(compareTyping('ez kurdî', 'ez kurdi', 'strict').done).toBe(false);
    });

    /*
     * Forgiving mode used to end the race on the e at once: an app that
     * finishes on `done` finished before the backtick could make it ê, and the
     * result had an accent missed that the racer was about to type.
     */
    it('in forgiving mode too, e where ê belongs waits for the next key — counted either way', () => {
      const r = compareTyping(TEXT, 'ez ji welate', 'forgiving');
      expect(r.chars[11]).toBe('pending');
      expect(r).toMatchObject({ correct: 12, accentMisses: 0, accented: 0, errors: 0, awaitingBacktick: true });
      // a space after it: an accent missed, and the letter still counts
      const missed = compareTyping(TEXT, 'ez ji welate ', 'forgiving');
      expect(missed.chars[11]).toBe('accent');
      expect(missed).toMatchObject({ correct: 13, accentMisses: 1, accented: 1, awaitingBacktick: false });
      // a backtick after it: ê
      const shortcut = compareTyping(TEXT, applyBacktickShortcut('ez ji welate', '`'), 'forgiving');
      expect(shortcut.chars[11]).toBe('ok');
      expect(shortcut).toMatchObject({ correct: 12, accentMisses: 0, accented: 1 });

      // the text's last letter: not done until the next key, or the race is scored
      const last = compareTyping('ez kurdî', 'ez kurdi', 'forgiving');
      expect(last).toMatchObject({ done: false, awaitingBacktick: true, caret: 8, correct: 8 });
      expect(compareTyping('ez kurdî', applyBacktickShortcut('ez kurdi', '`'), 'forgiving')).toMatchObject({
        done: true,
        awaitingBacktick: false,
        accentMisses: 0,
      });
      const scored = compareTyping('ez kurdî', 'ez kurdi', 'forgiving', { final: true });
      expect(scored).toMatchObject({ done: true, awaitingBacktick: false, correct: 8, accentMisses: 1 });
    });

    it('does not wait for a backtick with the shortcut off, in hidden mode, or for a Soranî letter', () => {
      for (const mode of ['strict', 'forgiving'] as const) {
        const r = compareTyping('ez kurdî', 'ez kurdi', mode, { backtickShortcut: false });
        expect(r, mode).toMatchObject({ done: true, awaitingBacktick: false });
        expect(r.chars[7], mode).toBe(mode === 'strict' ? 'wrong' : 'accent');
      }
      // hidden shows i, and i is the letter
      expect(compareTyping('ez kurdî', 'ez kurdi', 'hidden')).toMatchObject({ done: true, awaitingBacktick: false });
      // no backtick makes ێ, so ی where it belongs is forgiven at once
      const sorani = compareTyping('بێ', 'بی', 'forgiving', { dialect: 'sorani' });
      expect(sorani).toMatchObject({ done: true, awaitingBacktick: false, accentMisses: 1 });
    });

    it('drops a trailing dead key when the race is scored, and counts the letter it never got', () => {
      const r = compareTyping('ez kurdî', 'ez kurdˆ', 'strict', { final: true });
      expect(r.chars.at(-1)).toBe('pending');
      expect(r.correct).toBe(7);
      expect(r.done).toBe(false);
    });

    it('gives the same answer key by key as all at once', () => {
      const typed = 'ez ji wlatê xwee hez dikin';
      const stepwise: TypingComparison[] = [];
      for (let i = 0; i <= typed.length; i++) stepwise.push(compareTyping(TEXT, typed.slice(0, i), 'forgiving'));
      // a backspace, and a different text in between, which throws the cache away
      compareTyping(TEXT, typed.slice(0, 5), 'forgiving');
      compareTyping('something else entirely', 'some', 'forgiving');
      for (let i = 0; i <= typed.length; i++) {
        expect(compareTyping(TEXT, typed.slice(0, i), 'forgiving')).toEqual(stepwise[i]);
      }
    });
  });

  it('ranks nonsense as nonsense', () => {
    const r = compareTyping(TEXT, 'q'.repeat(26), 'strict', { final: true });
    expect(r.correct).toBe(0);
    expect(r.errors).toBe(26);
  });

  it('counts what is typed past the end of the text as extra', () => {
    const r = compareTyping(TEXT, `${TEXT} xxxx`, 'strict', { final: true });
    expect(r.correct).toBe(26);
    expect(r.errors).toBe(5);
    expect(r.extra).toEqual([{ before: 26, text: ' xxxx' }]);
    // far past it, too — past the window, and past twice the text, where the
    // rest is not compared at all
    const far = compareTyping('ez ji welat', `ez ji welat${'x'.repeat(TYPING_WINDOW.ahead * 3)}`, 'strict', {
      final: true,
    });
    expect(far.correct).toBe(11);
    expect(far.errors).toBe(TYPING_WINDOW.ahead * 3);
    expect(far.extra).toEqual([{ before: 11, text: 'x'.repeat(TYPING_WINDOW.ahead * 3) }]);
  });

  it('handles an empty text and an empty typing', () => {
    expect(compareTyping('', '', 'strict', { final: true })).toMatchObject({ correct: 0, done: false, chars: [] });
    expect(compareTyping(TEXT, '', 'strict', { final: true })).toMatchObject({ correct: 0, errors: 0, done: false });
  });

  it('keeps up with a long text', () => {
    const long = 'ez ji welatê xwe hez dikim '.repeat(74).trim(); // ~2000 characters
    const typed = long.replace(/welatê/g, 'welate').slice(0, 1900);
    const started = Date.now();
    const r = compareTyping(long, typed, 'forgiving', { final: true });
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.correct).toBe(1900);
    expect(r.accentMisses).toBe(r.accented);
  });

  /*
   * The comparison used to look for the racer within 64 characters of the
   * diagonal — the typing's length against the text's, from the start — so
   * the slips of a long text added up: once the letters left out and typed
   * twice came to more than 64 between them, everything typed after was wrong,
   * however right, and a race typed to the end could never finish. These are a
   * real text of almost a thousand characters, which never repeats itself (a
   * repeated text would let a skip line up with a later copy of itself).
   */
  describe('slips anywhere in a long text', () => {
    const t = [...normalizeTyping(NEWROZ)];
    const n = t.length;
    /** every other word, changed by `change` */
    const everyOtherWord = (change: (word: string) => string): string =>
      normalizeTyping(NEWROZ)
        .split(' ')
        .map((word, i) => (i % 2 === 0 ? change(word) : word))
        .join(' ');

    it('is a text long enough to have broken it', () => {
      expect(n).toBeGreaterThan(900);
      expect(compareTyping(NEWROZ, NEWROZ, 'strict', { final: true })).toMatchObject({ correct: n, errors: 0 });
    });

    it('costs a line skipped only that line, and the race still finishes', () => {
      // 70 characters is a line of the race text on a wide screen
      const skipped = [...t.slice(0, 300), ...t.slice(370)].join('');
      for (const final of [false, true]) {
        const r = compareTyping(NEWROZ, skipped, 'strict', { final });
        expect(r, `final ${final}`).toMatchObject({ correct: n - 70, errors: 70, done: true, caret: n });
        // the line is one run of wrong, and everything either side of it is
        // right — no letter the line happens to share with what came next
        // shown as typed in the middle of it
        expect(marks(r), `final ${final}`).toBe('o'.repeat(300) + 'X'.repeat(70) + 'o'.repeat(n - 370));
      }
    });

    it('finds the racer again after a stretch of 100 characters skipped or typed twice', () => {
      const skipped = compareTyping(NEWROZ, [...t.slice(0, 300), ...t.slice(400)].join(''), 'strict', { final: true });
      expect(skipped).toMatchObject({ correct: n - 100, errors: 100, done: true });
      const twice = compareTyping(NEWROZ, [...t.slice(0, 500), ...t.slice(400)].join(''), 'strict', { final: true });
      expect(twice).toMatchObject({ correct: n, errors: 100, done: true });
      expect(twice.chars.every((c) => c === 'ok')).toBe(true);
    });

    it('costs a letter typed twice in every other word only those letters', () => {
      const doubled = everyOtherWord((word) => word[0] + word);
      const extra = [...doubled].length - n;
      expect(extra).toBeGreaterThan(64);
      for (const final of [false, true]) {
        const r = compareTyping(NEWROZ, doubled, 'strict', { final });
        expect(r, `final ${final}`).toMatchObject({ correct: n, errors: extra, done: true });
        expect(r.chars.every((c) => c === 'ok'), `final ${final}`).toBe(true);
        expect(r.extra.reduce((sum, run) => sum + run.text.length, 0)).toBe(extra);
      }
    });

    it('costs a letter left out of every other word only those letters', () => {
      // as an English keyboard without ş or ç leaves them out, but everywhere
      const dropped = everyOtherWord((word) => (word.length > 1 ? word.slice(1) : word));
      const missing = n - [...dropped].length;
      expect(missing).toBeGreaterThan(64);
      for (const final of [false, true]) {
        const r = compareTyping(NEWROZ, dropped, 'strict', { final });
        expect(r, `final ${final}`).toMatchObject({ correct: n - missing, errors: missing, done: true, caret: n });
        expect(r.chars.filter((c) => c === 'wrong'), `final ${final}`).toHaveLength(missing);
        expect(r.chars.filter((c) => c === 'pending'), `final ${final}`).toHaveLength(0);
      }
    });

    it('in forgiving mode, counts every accent left out of a long text, and only those', () => {
      const plain = [...normalizeTyping(NEWROZ)].map(foldAccent).join('');
      const accents = t.filter((c) => foldAccent(c) !== c).length;
      expect(accents).toBeGreaterThan(64);
      const r = compareTyping(NEWROZ, plain, 'forgiving', { final: true });
      expect(r).toMatchObject({ correct: n, accentMisses: accents, accented: accents, errors: 0, done: true });
    });

    it('gives the same answer key by key as all at once, after a skip', () => {
      const typed = [...t.slice(0, 300), ...t.slice(370)];
      const all = compareTyping(NEWROZ, typed.join(''), 'forgiving');
      compareTyping('something else entirely', 'some', 'forgiving');
      let last: TypingComparison | undefined;
      for (let i = 0; i <= typed.length; i++) last = compareTyping(NEWROZ, typed.slice(0, i).join(''), 'forgiving');
      expect(last).toEqual(all);
      // and back again, as backspace does: the same as worked out afresh
      const back = compareTyping(NEWROZ, typed.slice(0, 350).join(''), 'forgiving');
      compareTyping('something else entirely', 'some', 'forgiving');
      expect(compareTyping(NEWROZ, typed.slice(0, 350).join(''), 'forgiving')).toEqual(back);
    });
  });
});

describe('applyBacktickShortcut', () => {
  it('turns a base letter and a backtick into the accented letter', () => {
    const pairs: Array<[string, string]> = [
      ['e', 'ê'],
      ['i', 'î'],
      ['u', 'û'],
      ['c', 'ç'],
      ['s', 'ş'],
      ['E', 'Ê'],
      ['S', 'Ş'],
    ];
    for (const [base, accented] of pairs) expect(applyBacktickShortcut(`ez ${base}`, '`')).toBe(`ez ${accented}`);
  });

  it('types anything else as itself', () => {
    expect(applyBacktickShortcut('ez', 'j')).toBe('ezj');
    expect(applyBacktickShortcut('ez ', '`')).toBe('ez `');
    expect(applyBacktickShortcut('ê', '`')).toBe('ê`');
    expect(applyBacktickShortcut('', '`')).toBe('`');
    expect(applyBacktickShortcut('a', '`')).toBe('a`');
  });
});

describe('findUntypeable', () => {
  it('finds nothing in a text any Kurmancî keyboard (with the key bar) can type', () => {
    expect(findUntypeable('Ez’ê bêm — sibê… “baş” 12%!', 'kurmanci')).toEqual([]);
  });

  it('lists what nobody can type, once each, with its code point and count', () => {
    expect(findUntypeable('Café é ñ', 'kurmanci')).toEqual([
      { char: 'é', codePoint: 'U+00E9', count: 2 },
      { char: 'ñ', codePoint: 'U+00F1', count: 1 },
    ]);
  });

  it('knows the Soranî keyboard: its alphabet, ه, Arabic punctuation and digits', () => {
    expect(findUntypeable('ڕۆژێکی خۆش، بەڵێ؟ ھەر ١٢٣ خانه', 'sorani')).toEqual([]);
    // a Persian letter Kurdish does not use, and Kurmancî letters in a Soranî text are fine (ASCII) or not (ê)
    expect(findUntypeable('ثابت ê', 'sorani').map((c) => c.char)).toEqual(['ث', 'ê']);
    expect(isTypeable('ک', 'kurmanci')).toBe(false);
    expect(isTypeable('ş', 'kurmanci')).toBe(true);
    expect(isTypeable('Ş', 'kurmanci')).toBe(true);
  });
});

describe('keyboard guides', () => {
  it('has two to four steps for each variety on every platform', () => {
    expect(Object.keys(KEYBOARD_GUIDES).sort()).toEqual([...KEYBOARD_PLATFORMS].sort());
    for (const platform of KEYBOARD_PLATFORMS) {
      for (const dialect of ['kurmanci', 'sorani'] as const) {
        const steps = KEYBOARD_GUIDES[platform][dialect];
        expect(steps.length, `${platform} ${dialect}`).toBeGreaterThanOrEqual(2);
        expect(steps.length, `${platform} ${dialect}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('fills every placeholder with a screen name, and leaves no name unused', () => {
    for (const platform of KEYBOARD_PLATFORMS) {
      for (const dialect of ['kurmanci', 'sorani'] as const) {
        for (const step of KEYBOARD_GUIDES[platform][dialect]) {
          expect(step.key).toMatch(/^keyboardGuide\.[a-z]+\.[A-Za-z]+$/);
          const used = [...step.en.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
          expect(used.sort(), step.key).toEqual((step.ui ?? []).map((_, i) => i));
          expect(keyboardStepText(step)).not.toMatch(/\{\d+\}/);
        }
      }
    }
  });

  it('gives one i18n key one sentence', () => {
    const seen = new Map<string, string>();
    for (const platform of KEYBOARD_PLATFORMS) {
      for (const dialect of ['kurmanci', 'sorani'] as const) {
        for (const step of KEYBOARD_GUIDES[platform][dialect]) {
          const before = seen.get(step.key);
          if (before !== undefined) expect(step.en, step.key).toBe(before);
          seen.set(step.key, step.en);
        }
      }
    }
  });

  it('names the keyboards as the devices show them', () => {
    const names = (platform: (typeof KEYBOARD_PLATFORMS)[number], dialect: 'kurmanci' | 'sorani') =>
      KEYBOARD_GUIDES[platform][dialect].flatMap((s) => s.ui ?? []);
    expect(names('android', 'kurmanci')).toContain('Kurdish (Latin)');
    expect(names('android', 'sorani')).toContain('Kurdish (Iraq) Arabic');
    // the way to Gboard's languages when its toolbar has no ⚙
    expect(names('android', 'kurmanci')).toContain('On-screen keyboard');
    expect(names('ios', 'sorani')).toContain('Kurdish, Sorani');
    expect(names('windows', 'sorani')).toContain('Central Kurdish');
    expect(names('mac', 'kurmanci')).toContain('ABC – Extended');
    expect(names('mac', 'sorani')).toContain('Kurdish-Sorani');
    expect(names('linux', 'kurmanci')).toContain('Kurdish (Turkey, Latin Q)');
    expect(names('linux', 'sorani')).toContain('Kurdish (Iraq, Arabic-Latin)');
  });

  it('points a Kurmancî reader at Kurdish (Latin), never another language’s keyboard', () => {
    for (const platform of KEYBOARD_PLATFORMS) {
      for (const step of KEYBOARD_GUIDES[platform].kurmanci) {
        expect(keyboardStepText(step), `${platform} ${step.key}`).not.toMatch(/Turkish|English/);
      }
    }
    for (const platform of ['android', 'ios', 'windows', 'mac'] as const) {
      const names = KEYBOARD_GUIDES[platform].kurmanci.flatMap((s) => s.ui ?? []);
      expect(names, platform).toContain('Kurdish (Latin)');
    }
    // and says what to do when it is not in the list
    expect(KEYBOARD_GUIDES.ios.kurmanci.at(-1)!.key).toBe('keyboardGuide.ios.noLatin');
    expect(KEYBOARD_GUIDES.windows.kurmanci.at(-1)!.key).toBe('keyboardGuide.windows.noLatin');
  });

  it('puts a translated sentence’s placeholders back the same way', () => {
    const step = KEYBOARD_GUIDES.android.kurmanci[1]!;
    expect(keyboardStepText(step)).toBe('Go to Languages → Add keyboard.');
    expect(keyboardStepText(step, 'Here {1} then {0}')).toBe('Here Add keyboard then Languages');
  });
});

describe('detectKeyboardPlatform', () => {
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  };

  it('trusts the phone’s own platform first', () => {
    expect(detectKeyboardPlatform('', 'ios')).toBe('ios');
    expect(detectKeyboardPlatform('', 'android')).toBe('android');
    expect(detectKeyboardPlatform(UA.windows, 'android')).toBe('android');
  });

  it('reads a browser’s user agent', () => {
    expect(detectKeyboardPlatform(UA.iphone)).toBe('ios');
    expect(detectKeyboardPlatform(UA.android)).toBe('android');
    expect(detectKeyboardPlatform(UA.windows)).toBe('windows');
    expect(detectKeyboardPlatform(UA.ipad)).toBe('mac');
    expect(detectKeyboardPlatform(UA.linux)).toBe('linux');
  });

  it('knows an iPad that says it is a Mac by its touch screen', () => {
    expect(detectKeyboardPlatform(UA.ipad, 'web', { coarsePointer: true })).toBe('ios');
  });

  it('says it does not know rather than guess', () => {
    expect(detectKeyboardPlatform(UA.chromebook)).toBeNull();
    expect(detectKeyboardPlatform('')).toBeNull();
  });
});
