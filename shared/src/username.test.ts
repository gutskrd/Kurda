import { describe, expect, it } from 'vitest';
import {
  USERNAME_KURDISH_LETTERS,
  USERNAME_MAX,
  USERNAME_MIN,
  checkUsername,
  foldForReserved,
  handleName,
  isReservedUsername,
  lowercaseAsTyped,
  normalizeUsername,
  numberedUsername,
  refusedChars,
  sameUsername,
  suggestUsername,
  usernameProblemWhileTyping,
  type UsernameReason,
} from './username.js';

// Explicit code points, so a precomposed letter and a decomposed one cannot be mistaken for each other here.
const COMBINING_CIRCUMFLEX = String.fromCharCode(0x302);
const COMBINING_CEDILLA = String.fromCharCode(0x327);
const COMBINING_DOT_ABOVE = String.fromCharCode(0x307);
const CAPITAL_DOTTED_I = String.fromCharCode(0x130);
const DOTLESS_I = String.fromCharCode(0x131);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const CYRILLIC_O = String.fromCharCode(0x43e);

const reasonOf = (raw: string): UsernameReason | 'ok' => {
  const r = checkUsername(raw);
  return r.ok ? 'ok' : r.reason;
};

describe('checkUsername', () => {
  it('takes lowercase letters, digits, dots and underscores', () => {
    expect(checkUsername('hamo')).toEqual({ ok: true, value: 'hamo' });
    expect(checkUsername('hamo.ali')).toEqual({ ok: true, value: 'hamo.ali' });
    expect(checkUsername('rojda_99')).toEqual({ ok: true, value: 'rojda_99' });
    expect(checkUsername('a.b_c.d')).toEqual({ ok: true, value: 'a.b_c.d' });
    expect(checkUsername('2hevalên')).toEqual({ ok: true, value: '2hevalên' });
  });

  it('takes every Kurdish letter, lowercase', () => {
    expect(USERNAME_KURDISH_LETTERS).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
    expect(checkUsername('çêîşû')).toEqual({ ok: true, value: 'çêîşû' });
    expect(checkUsername('şêrîn.zarok')).toEqual({ ok: true, value: 'şêrîn.zarok' });
  });

  it('writes capitals as lowercase letters, Kurdish ones too, rather than refusing them', () => {
    expect(checkUsername('Hamo')).toEqual({ ok: true, value: 'hamo' });
    expect(checkUsername('ÇÊÎŞÛ')).toEqual({ ok: true, value: 'çêîşû' });
    expect(checkUsername('ŞêrÎn_Zarok')).toEqual({ ok: true, value: 'şêrîn_zarok' });
  });

  it('reads the capital dotted I as a plain i, with no dot left over', () => {
    const r = checkUsername(`${CAPITAL_DOTTED_I}brahîm`);
    expect(r).toEqual({ ok: true, value: 'ibrahîm' });
    expect(r.ok && r.value.includes(COMBINING_DOT_ABOVE)).toBe(false);
    // the same capital, typed as an I and a combining dot
    expect(checkUsername(`I${COMBINING_DOT_ABOVE}brahîm`)).toEqual({ ok: true, value: 'ibrahîm' });
    expect(checkUsername('IRAN')).toEqual({ ok: true, value: 'iran' });
  });

  it('joins a letter and its combining mark into one Kurdish letter', () => {
    expect(checkUsername(`se${COMBINING_CIRCUMFLEX}rzan`)).toEqual({ ok: true, value: 'sêrzan' });
    expect(checkUsername(`S${COMBINING_CEDILLA}ev`)).toEqual({ ok: true, value: 'şev' });
  });

  it('lets go of the spaces around a name, and nothing else', () => {
    expect(checkUsername('  rojda  ')).toEqual({ ok: true, value: 'rojda' });
    expect(checkUsername('roj da')).toEqual({ ok: false, reason: 'invalid-chars', chars: [' '] });
  });

  it('names the characters that cannot be in a username, each once, in the order typed', () => {
    expect(checkUsername('ha!mo!?')).toEqual({ ok: false, reason: 'invalid-chars', chars: ['!', '?'] });
    expect(checkUsername('@hamo')).toEqual({ ok: false, reason: 'invalid-chars', chars: ['@'] });
    expect(checkUsername('ha-mo')).toEqual({ ok: false, reason: 'invalid-chars', chars: ['-'] });
    expect(checkUsername('özgür')).toEqual({ ok: false, reason: 'invalid-chars', chars: ['ö', 'ü'] });
    expect(checkUsername(`${DOTLESS_I}lgın`)).toEqual({ ok: false, reason: 'invalid-chars', chars: [DOTLESS_I] });
    expect(checkUsername('kurda😀')).toEqual({ ok: false, reason: 'invalid-chars', chars: ['😀'] });
    expect(checkUsername(`r${CYRILLIC_O}jda`)).toEqual({ ok: false, reason: 'invalid-chars', chars: [CYRILLIC_O] });
    expect(checkUsername(`roj${ZERO_WIDTH_SPACE}da`)).toEqual({ ok: false, reason: 'invalid-chars', chars: [ZERO_WIDTH_SPACE] });
    expect(reasonOf(`roj${String.fromCharCode(0)}da`)).toBe('invalid-chars');
  });

  it('keeps a mark NFC finds no letter for, and refuses it', () => {
    expect(checkUsername(`x${COMBINING_CIRCUMFLEX}an`)).toEqual({ ok: false, reason: 'invalid-chars', chars: [COMBINING_CIRCUMFLEX] });
  });

  it('holds names to 3–30 characters', () => {
    expect(USERNAME_MIN).toBe(3);
    expect(USERNAME_MAX).toBe(30);
    expect(reasonOf('ab')).toBe('too-short');
    expect(reasonOf('')).toBe('too-short');
    expect(reasonOf('abc')).toBe('ok');
    expect(reasonOf('a'.repeat(30))).toBe('ok');
    expect(reasonOf('a'.repeat(31))).toBe('too-long');
    // counted as letters, not as the code units a decomposed ê would take
    expect(reasonOf(`${'a'.repeat(29)}e${COMBINING_CIRCUMFLEX}`)).toBe('ok');
  });

  it('never starts or ends on a dot or an underscore', () => {
    for (const name of ['.hamo', 'hamo.', '_hamo', 'hamo_', '.hamo_']) expect(reasonOf(name), name).toBe('edge-punctuation');
  });

  it('never has two dots or underscores side by side', () => {
    for (const name of ['ha..mo', 'ha__mo', 'ha._mo', 'ha_.mo']) expect(reasonOf(name), name).toBe('double-punctuation');
  });

  it('needs a letter, and is not only digits', () => {
    expect(reasonOf('12345')).toBe('numbers-only');
    expect(reasonOf('12_34')).toBe('no-letter');
    expect(reasonOf('1.2.3')).toBe('no-letter');
    expect(reasonOf('1.2.a')).toBe('ok');
  });

  it('refuses the reserved names, written any way at all', () => {
    for (const name of ['admin', 'Admin', 'ad.min', 'a_d_m_i_n', 'adm1n', 'my_kurda', 'my.kurda', 'Hevalo', 'hev.alo', '0fficial', 'süpport'.replace('ü', 'u')]) {
      expect(reasonOf(name), name).toBe('reserved');
    }
    // a name that only holds a reserved one is somebody's own
    expect(reasonOf('adminakurdi')).toBe('ok');
    expect(reasonOf('hamo.admin.fan')).toBe('ok');
  });

  it('gives one name one reason: what typing on cannot mend comes first', () => {
    expect(reasonOf('a!')).toBe('invalid-chars');
    expect(reasonOf('.a')).toBe('edge-punctuation');
    expect(reasonOf('a..')).toBe('double-punctuation');
    expect(reasonOf('_')).toBe('edge-punctuation');
    expect(reasonOf(`${'a'.repeat(30)}!`)).toBe('invalid-chars');
    expect(reasonOf('ab.')).toBe('edge-punctuation');
  });

  it('takes what is not a string as nothing typed', () => {
    expect(reasonOf(undefined as unknown as string)).toBe('too-short');
    expect(reasonOf(null as unknown as string)).toBe('too-short');
  });
});

describe('normalizeUsername', () => {
  it('trims, joins marks and lowercases, and changes nothing else', () => {
    expect(normalizeUsername('  Şêr.Ali  ')).toBe('şêr.ali');
    expect(normalizeUsername('Ha mo!')).toBe('ha mo!');
    expect(normalizeUsername(`${CAPITAL_DOTTED_I}STANBUL`)).toBe('istanbul');
  });
});

describe('lowercaseAsTyped', () => {
  it('lowercases as it goes and keeps the caret where it was', () => {
    expect(lowercaseAsTyped('haMo', 3)).toEqual({ text: 'hamo', caret: 3 });
    expect(lowercaseAsTyped('ŞÊR', 1)).toEqual({ text: 'şêr', caret: 1 });
    expect(lowercaseAsTyped(`${CAPITAL_DOTTED_I}brahim`, 1)).toEqual({ text: 'ibrahim', caret: 1 });
  });

  it('takes nothing out: a space or a sign stays for the form to explain', () => {
    expect(lowercaseAsTyped('Ha mo!', 6)).toEqual({ text: 'ha mo!', caret: 6 });
    expect(lowercaseAsTyped(' hamo', 0)).toEqual({ text: ' hamo', caret: 0 });
  });

  it('moves the caret back by the mark NFC joins to the letter before it', () => {
    expect(lowercaseAsTyped(`se${COMBINING_CIRCUMFLEX}r`, 3)).toEqual({ text: 'sêr', caret: 2 });
  });

  it('puts a caret past the end at the end', () => {
    expect(lowercaseAsTyped('AB', 9)).toEqual({ text: 'ab', caret: 2 });
    expect(lowercaseAsTyped('AB')).toEqual({ text: 'ab', caret: 2 });
  });
});

describe('usernameProblemWhileTyping', () => {
  it('says at once what more typing cannot mend', () => {
    expect(usernameProblemWhileTyping('ha!')).toMatchObject({ reason: 'invalid-chars', chars: ['!'] });
    expect(usernameProblemWhileTyping('.h')).toMatchObject({ reason: 'edge-punctuation' });
    expect(usernameProblemWhileTyping('ha..')).toMatchObject({ reason: 'double-punctuation' });
    expect(usernameProblemWhileTyping('a'.repeat(31))).toMatchObject({ reason: 'too-long' });
    expect(usernameProblemWhileTyping('admin')).toMatchObject({ reason: 'reserved' });
  });

  it('waits on what the next keys may put right', () => {
    expect(usernameProblemWhileTyping('h')).toBeNull();
    expect(usernameProblemWhileTyping('hamo.')).toBeNull();
    expect(usernameProblemWhileTyping('hamo_')).toBeNull();
    expect(usernameProblemWhileTyping('123')).toBeNull();
    expect(usernameProblemWhileTyping('1_2')).toBeNull();
    expect(usernameProblemWhileTyping('hamo')).toBeNull();
  });
});

describe('refusedChars', () => {
  it('shows the characters that can be seen and says when there were spaces', () => {
    expect(refusedChars(['!', ' '])).toEqual({ visible: ['!'], unseen: true });
    expect(refusedChars([' '])).toEqual({ visible: [], unseen: true });
    expect(refusedChars([ZERO_WIDTH_SPACE])).toEqual({ visible: [], unseen: true });
    expect(refusedChars(['!', '?', '#', '%'])).toEqual({ visible: ['!', '?', '#'], unseen: false });
  });

  it('sets a lone accent on a dotted circle', () => {
    expect(refusedChars([COMBINING_CIRCUMFLEX])).toEqual({ visible: [`◌${COMBINING_CIRCUMFLEX}`], unseen: false });
  });
});

describe('sameUsername', () => {
  it('reads a handle and a name in other capitals as the same username', () => {
    expect(sameUsername('@Hamo', 'hamo')).toBe(true);
    expect(sameUsername(' ŞÊR ', 'şêr')).toBe(true);
    expect(sameUsername('hamo.', 'hamo')).toBe(true);
    expect(sameUsername('hamo', 'hamo.k')).toBe(false);
    expect(sameUsername('', '')).toBe(false);
  });
});

describe('handleName', () => {
  it('drops the @ before a handle and the full stop or comma after it', () => {
    expect(handleName('@hamo')).toBe('hamo');
    expect(handleName('  @@hamo. ')).toBe('hamo');
    expect(handleName('@hamo,')).toBe('hamo');
    expect(handleName('@hamo?!')).toBe('hamo');
  });

  it('keeps a dot inside the name', () => {
    expect(handleName('@hamo.k')).toBe('hamo.k');
    expect(handleName('@hamo.k.')).toBe('hamo.k');
  });
});

describe('suggestUsername', () => {
  it('makes a username from a name, lowercase first', () => {
    expect(suggestUsername('Hamo Ali')).toBe('hamo_ali');
    expect(suggestUsername('ŞÊRÎN Zarok')).toBe('şêrîn_zarok');
    expect(suggestUsername('hamo.ali')).toBe('hamo.ali');
  });

  it('gives a marked letter of another alphabet its plain letter', () => {
    expect(suggestUsername('Şêrîn Özdemir')).toBe('şêrîn_ozdemir');
    expect(suggestUsername('José Müller')).toBe('jose_muller');
    expect(suggestUsername(`${CAPITAL_DOTTED_I}lhan Yıldız`)).toBe('ilhan_yildiz');
  });

  it('puts one underscore between the parts, and none at the ends', () => {
    expect(suggestUsername('  --Hamo -- Ali--  ')).toBe('hamo_ali');
    expect(suggestUsername('Ali Jr.')).toBe('ali_jr');
  });

  it('cuts a long name to length without ending on a mark', () => {
    const made = suggestUsername('Abdulrahman Mohammed Abdulkar Sharif');
    expect(made).toBe('abdulrahman_mohammed_abdulkar');
    expect(checkUsername(made).ok).toBe(true);
  });

  it('has nothing to offer for a name it cannot write, or a reserved one', () => {
    expect(suggestUsername('هیوا')).toBeNull();
    expect(suggestUsername('A')).toBeNull();
    expect(suggestUsername('Admin')).toBeNull();
    expect(suggestUsername('')).toBeNull();
  });
});

describe('numberedUsername', () => {
  it('puts the number after an underscore', () => {
    expect(numberedUsername('hamo', 2)).toBe('hamo_2');
    expect(numberedUsername('hamo.ali', 12)).toBe('hamo.ali_12');
  });

  it('keeps within thirty characters, and never puts two marks side by side', () => {
    const made = numberedUsername(`${'a'.repeat(27)}_bc`, 2);
    expect(made).toBe(`${'a'.repeat(27)}_2`);
    expect(made.length).toBeLessThanOrEqual(USERNAME_MAX);
    expect(checkUsername(made).ok).toBe(true);
  });
});

describe('the reserved names', () => {
  it('fold case, Kurdish letters, separators and look-alike digits away', () => {
    expect(foldForReserved('My_Kûrda')).toBe('mykurda');
    expect(foldForReserved('Adm1n')).toBe('admin');
    expect(foldForReserved('ad.min')).toBe('admin');
  });

  it('are refused, and ordinary names are not', () => {
    expect(isReservedUsername('system')).toBe(true);
    expect(isReservedUsername('SUPPORT')).toBe(true);
    expect(isReservedUsername('sup.port')).toBe(true);
    expect(isReservedUsername('rojda')).toBe(false);
    expect(isReservedUsername('kurda_fan')).toBe(false);
  });
});
