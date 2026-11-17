import { describe, expect, it } from 'vitest';
import {
  COUCH_DEFAULTS,
  COUCH_MAX_PLAYERS,
  COUCH_NAME_MAX,
  COUCH_SECOND_VOTE_SECONDS,
  couchCastVote,
  couchGuess,
  couchHand,
  couchKept,
  couchName,
  couchNames,
  couchNextClue,
  couchPoint,
  couchReader,
  couchReveal,
  couchScores,
  couchSecondTimeUp,
  couchSeen,
  couchSettingsFor,
  couchSpeaker,
  couchStart,
  couchStillHidden,
  couchSuspects,
  couchToVote,
  couchTotals,
  couchVoter,
  type CouchCard,
  type CouchSettings,
  type CouchState,
} from './couch.js';
import { IMPOSTOR_POINTS } from './rules.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const CARD: CouchCard = {
  word: 'pisîk',
  meanings: { en: 'cat' },
  hint: { ku: 'heywan', meanings: { en: 'animal' } },
  decoys: ['kûçik', 'hesp', 'mişk'],
  twin: { word: 'kûçik', meanings: { en: 'dog' } },
};
const NAMES = ['Azad', 'Berfîn', 'Ciwan', 'Dîlan', 'Evîn', 'Ferhad', 'Gulê'];

/** A round of `n`, with the impostors and the speaking order put where a test wants them. */
function round(n = 4, settings: Partial<CouchSettings> = {}, impostors = [1]): CouchState {
  const s = couchStart('kmr', NAMES.slice(0, n), { ...COUCH_DEFAULTS, ...settings }, CARD, 'seed');
  return { ...s, impostors, order: s.players.map((_, i) => i) };
}
const dealt = (s: CouchState): CouchState => s.players.reduce((x) => couchSeen(x), s);
const clued = (s: CouchState): CouchState => {
  let x = dealt(s);
  while (x.phase === 'clues') x = couchNextClue(x);
  return x;
};
/** Everything up to the vote, then each seat's vote in seat order. */
const voted = (s: CouchState, votes: Array<number | null>): CouchState => votes.reduce((x, v) => couchCastVote(x, v), couchToVote(clued(s)));

describe('the names', () => {
  it('are kept short, on one line and without anything that could turn the text round', () => {
    expect(couchName('  Azad \n Berxwedan  ')).toBe('Azad Berxwedan');
    expect(couchName('a‮b\u0000c')).toBe('a b c');
    expect([...couchName('x'.repeat(40))]).toHaveLength(COUCH_NAME_MAX);
  });

  it('need three people, none blank and no two alike', () => {
    expect(couchNames(['Azad', 'Berfîn'])).toEqual({ ok: false, reason: 'too-few' });
    expect(couchNames(Array.from({ length: COUCH_MAX_PLAYERS + 1 }, (_, i) => `p${i}`))).toEqual({ ok: false, reason: 'too-many' });
    expect(couchNames(['Azad', ' ', 'Ciwan'])).toEqual({ ok: false, reason: 'empty' });
    expect(couchNames(['Azad', 'azad', 'Ciwan'])).toEqual({ ok: false, reason: 'same' });
    expect(couchNames([' Azad ', 'Berfîn', 'Ciwan'])).toEqual({ ok: true, names: ['Azad', 'Berfîn', 'Ciwan'] });
  });
});

describe('what a phone kept', () => {
  it('comes back as the names and the settings it wrote', () => {
    const settings = { way: 'odd', impostors: 2, rounds: 3, clueSeconds: 0, talkSeconds: 300, vote: 'open' } as const;
    expect(couchKept({ names: ['Azad', 'Berfîn', 'Ciwan'], settings })).toEqual({ names: ['Azad', 'Berfîn', 'Ciwan'], settings });
  });

  it('keeps only settings the game has, and names as the game keeps them', () => {
    const kept = couchKept({ names: ['  Azad\u202e  ', 'x'.repeat(40), 'Ciwan'], settings: { way: 'loud', impostors: 9, rounds: 12, clueSeconds: 7, talkSeconds: -1, vote: 'shout', extra: true }, cards: ['pisîk'] })!;
    expect(kept.names).toEqual(['Azad', 'x'.repeat(COUCH_NAME_MAX), 'Ciwan']);
    expect(kept.settings).toEqual(COUCH_DEFAULTS);
    expect(Object.keys(kept)).toEqual(['names', 'settings']);
    expect(couchKept({ names: Array.from({ length: 30 }, (_, i) => `p${i}`) })!.names).toHaveLength(COUCH_MAX_PLAYERS);
  });

  it('is nothing at all when it is not what a phone wrote', () => {
    for (const raw of [null, undefined, 'names', 7, [], { names: 'Azad' }, { names: ['Azad', 3] }, { settings: COUCH_DEFAULTS }]) expect(couchKept(raw)).toBeNull();
  });
});

describe('the deal', () => {
  it('is the same for the same seed, and puts the word among the options', () => {
    const a = couchStart('kmr', NAMES.slice(0, 5), COUCH_DEFAULTS, CARD, 'one');
    const b = couchStart('kmr', NAMES.slice(0, 5), COUCH_DEFAULTS, CARD, 'one');
    expect(a).toEqual(b);
    expect(a.options).toHaveLength(4);
    expect(a.options).toContain('pisîk');
    expect(a.impostors).toHaveLength(1);
    expect([...a.order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('goes round the room in the order people sit, from a seat the seed draws', () => {
    const s = couchStart('kmr', NAMES.slice(0, 5), COUCH_DEFAULTS, CARD, 'two');
    const first = s.order[0]!;
    expect(s.order).toEqual([0, 1, 2, 3, 4].map((i) => (i + first) % 5));
  });

  it('never lets an impostor speak first, with one impostor or two', () => {
    for (const seed of Array.from({ length: 40 }, (_, i) => `first-${i}`)) {
      for (const impostors of [1, 2] as const) {
        const s = couchStart('kmr', NAMES, { ...COUCH_DEFAULTS, impostors }, CARD, seed);
        expect(s.impostors).not.toContain(s.order[0]);
        const first = s.order[0]!;
        expect(s.order).toEqual(NAMES.map((_, i) => (i + first) % NAMES.length));
      }
    }
  });

  it('allows a second impostor only in a room of six or more', () => {
    expect(couchSettingsFor(5, CARD, { ...COUCH_DEFAULTS, impostors: 2 }).impostors).toBe(1);
    expect(couchSettingsFor(6, CARD, { ...COUCH_DEFAULTS, impostors: 2 }).impostors).toBe(2);
    expect(couchStart('kmr', NAMES, { ...COUCH_DEFAULTS, impostors: 2 }, CARD, 's').impostors).toHaveLength(2);
  });

  it('plays the plain game when a card has no second word for the odd one out', () => {
    expect(couchSettingsFor(4, { twin: null }, { ...COUCH_DEFAULTS, way: 'odd' }).way).toBe('classic');
    expect(couchSettingsFor(4, CARD, { ...COUCH_DEFAULTS, way: 'odd' }).way).toBe('odd');
  });

  it('says when this round alone fell back to the plain game, and the next card plays the way the room asked', () => {
    const odd = { ...COUCH_DEFAULTS, way: 'odd' } as const;
    const plain = couchStart('kmr', NAMES.slice(0, 4), odd, { ...CARD, twin: null }, 's');
    expect(plain.settings.way).toBe('classic');
    expect(plain.oddFallback).toBe(true);
    const next = couchStart('kmr', NAMES.slice(0, 4), odd, CARD, 't');
    expect(next.settings.way).toBe('odd');
    expect(next.oddFallback).toBe(false);
    expect(couchStart('kmr', NAMES.slice(0, 4), COUCH_DEFAULTS, { ...CARD, twin: null }, 's').oddFallback).toBe(false);
  });
});

describe('a card', () => {
  it('shows the word to everyone but the impostor, who is told the category', () => {
    const s = round();
    expect(couchHand(s, 0)).toEqual({ role: 'player', word: 'pisîk', meanings: { en: 'cat' }, hint: CARD.hint });
    expect(couchHand(s, 1)).toEqual({ role: 'impostor', hint: CARD.hint });
  });

  it('tells a blind impostor nothing', () => {
    expect(couchHand(round(4, { way: 'blind' }), 1)).toEqual({ role: 'impostor', hint: null });
  });

  it('gives the odd one out a card that looks like anyone’s, with the other word on it', () => {
    const s = round(4, { way: 'odd' });
    expect(couchHand(s, 1)).toEqual({ role: 'player', word: 'kûçik', meanings: { en: 'dog' }, hint: CARD.hint });
    expect(couchHand(s, 2)).toMatchObject({ role: 'player', word: 'pisîk' });
  });
});

describe('going round', () => {
  it('hands the phone to each seat in turn, then starts the clues', () => {
    let s = round(3);
    expect(couchReader(s)).toBe(0);
    s = couchSeen(s);
    expect(couchReader(s)).toBe(1);
    s = couchSeen(couchSeen(s));
    expect(couchReader(s)).toBeNull();
    expect(s.phase).toBe('clues');
    expect(couchSpeaker(s)).toEqual({ seat: 0, round: 1 });
  });

  it('takes a clue from each seat, as many times round as was chosen, then talks', () => {
    let s = dealt(round(3, { rounds: 2 }));
    const said: Array<{ seat: number; round: number }> = [];
    while (s.phase === 'clues') {
      said.push(couchSpeaker(s)!);
      s = couchNextClue(s);
    }
    expect(said.map((x) => x.seat)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(said.map((x) => x.round)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(s.phase).toBe('talk');
    expect(couchToVote(s).phase).toBe('vote');
  });

  it('goes straight to the vote when there is no time to talk', () => {
    expect(clued(round(3, { talkSeconds: 0, rounds: 1 })).phase).toBe('vote');
  });
});

describe('a private vote', () => {
  it('asks each seat in turn and never lets one vote for itself', () => {
    let s = couchToVote(clued(round()));
    expect(couchVoter(s)).toBe(0);
    expect(couchCastVote(s, 0)).toBe(s);
    expect(couchCastVote(s, 9)).toBe(s);
    s = couchCastVote(s, 1);
    expect(couchVoter(s)).toBe(1);
  });

  it('catches the impostor on the most votes, and gives them one guess', () => {
    const s = voted(round(), [1, 0, 1, 1]);
    expect(s.accused).toBe(1);
    expect(s.phase).toBe('guess');
    const right = couchGuess(s, s.options.indexOf('pisîk'));
    expect(right.endedBy).toBe('guessed');
    const wrong = couchGuess(s, s.options.indexOf('hesp'));
    expect(wrong.endedBy).toBe('caught');
    expect(couchGuess(s, 7)).toBe(s);
  });

  it('lets the impostor slip away on a tie, on the wrong seat, or when nobody chooses', () => {
    expect(voted(round(), [1, 0, 3, 2]).endedBy).toBe('escaped');
    expect(voted(round(), [2, 2, 3, 2]).endedBy).toBe('escaped');
    expect(voted(round(), [null, null, null, null])).toMatchObject({ accused: null, endedBy: 'escaped' });
  });

  it('ends at once when the odd one out is caught: there is no word for them to name', () => {
    const s = voted(round(4, { way: 'odd' }), [1, 0, 1, 1]);
    expect(s.phase).toBe('reveal');
    expect(s.endedBy).toBe('caught');
  });
});

describe('an open vote', () => {
  it('takes the room’s one choice, or none', () => {
    const s = couchToVote(clued(round(4, { vote: 'open' })));
    expect(couchVoter(s)).toBeNull();
    expect(couchPoint(s, 1).phase).toBe('guess');
    expect(couchPoint(s, 2).endedBy).toBe('escaped');
    expect(couchPoint(s, null).endedBy).toBe('escaped');
    expect(couchPoint(s, 12)).toBe(s);
  });

  it('is not open to a round that votes in private', () => {
    const s = couchToVote(clued(round()));
    expect(couchPoint(s, 1)).toBe(s);
  });
});

describe('the points', () => {
  it('pay each right vote, and the table for a catch', () => {
    const s = voted(round(), [1, 0, 1, 2]);
    const end = couchGuess(s, s.options.indexOf('hesp'));
    expect(couchScores(end)).toEqual([IMPOSTOR_POINTS.rightVote + IMPOSTOR_POINTS.caught, 0, IMPOSTOR_POINTS.rightVote + IMPOSTOR_POINTS.caught, IMPOSTOR_POINTS.caught]);
  });

  it('pay the impostor for slipping away, or for naming the word once caught', () => {
    expect(couchScores(voted(round(), [2, 2, 3, 2]))).toEqual([0, IMPOSTOR_POINTS.escaped, 0, 0]);
    const s = voted(round(), [1, 0, 1, 1]);
    const end = couchGuess(s, s.options.indexOf('pisîk'));
    expect(couchScores(end)[1]).toBe(IMPOSTOR_POINTS.guessedWord);
    expect(couchScores(end)[3]).toBe(IMPOSTOR_POINTS.rightVote);
  });

  it('pay both impostors when the room picks neither', () => {
    const s = voted(round(6, { impostors: 2 }, [1, 4]), [2, 2, 3, 2, 2, 2]);
    expect(s.endedBy).toBe('escaped');
    expect(couchScores(s)).toEqual([0, IMPOSTOR_POINTS.escaped, 0, 0, IMPOSTOR_POINTS.escaped, 0]);
  });

  it('are nothing before the round is over, and add up over an evening', () => {
    expect(couchScores(round())).toEqual([0, 0, 0, 0]);
    const end = voted(round(), [2, 2, 3, 2]);
    expect(couchTotals([1, 1, 1, 1], end)).toEqual([1, 1 + IMPOSTOR_POINTS.escaped, 1, 1]);
    expect(couchTotals([], end)).toEqual([0, IMPOSTOR_POINTS.escaped, 0, 0]);
  });
});

describe('the reveal', () => {
  it('is nothing until the round is over', () => {
    expect(couchReveal(round())).toBeNull();
  });

  it('says who it was, the word, the guess and every vote', () => {
    const s = voted(round(), [1, 0, 1, 1]);
    const end = couchGuess(s, s.options.indexOf('hesp'));
    expect(couchReveal(end)).toEqual({
      impostors: [1],
      word: 'pisîk',
      meanings: { en: 'cat' },
      twin: null,
      accused: 1,
      caught: true,
      guessed: 'hesp',
      votes: [1, 0, 1, 1],
      endedBy: 'caught',
      escape: null,
      second: null,
      stillHidden: null,
    });
  });

  it('says why the impostor got away: a shared top, the wrong seat, or nobody named', () => {
    expect(couchReveal(voted(round(), [1, 0, 3, 2]))?.escape).toBe('tie');
    expect(couchReveal(voted(round(), [2, 2, 3, 2]))).toMatchObject({ escape: 'wrong-out', accused: 2 });
    expect(couchReveal(voted(round(), [null, null, null, null]))?.escape).toBe('no-votes');
    // a room that points at nobody could not agree
    expect(couchReveal(couchPoint(couchToVote(clued(round(4, { vote: 'open' }))), null))?.escape).toBe('tie');
  });

  it('shows the other word after an odd-word round', () => {
    expect(couchReveal(voted(round(4, { way: 'odd' }), [1, 0, 1, 1]))?.twin).toEqual({ word: 'kûçik', meanings: { en: 'dog' } });
  });
});

describe('two impostors', () => {
  /** A room of six with seats 1 and 4 the impostors, voted on in private, the first vote catching seat 1. */
  const caughtOne = (settings: Partial<CouchSettings> = {}): CouchState => {
    const s = round(6, { impostors: 2, ...settings }, [1, 4]);
    return settings.vote === 'open' ? couchPoint(couchToVote(clued(s)), 1) : voted(s, [1, 0, 1, 1, 1, 1]);
  };

  it('hunt the second once the first is caught and has guessed, everyone else voting once more', () => {
    const s = caughtOne();
    expect(s.phase).toBe('guess');
    const after = couchGuess(s, s.options.indexOf('hesp'));
    expect(after.phase).toBe('second');
    expect(after.endedBy).toBe('caught');
    expect(couchStillHidden(after)).toBe(4);
    expect(after.second?.voters).toEqual([0, 2, 3, 4, 5]);
    expect(couchSuspects(after)).toEqual([0, 2, 3, 4, 5]);
    expect(couchScores(after)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(couchReveal(after)).toBeNull();
    expect(COUCH_SECOND_VOTE_SECONDS).toBe(30);
  });

  it('go straight to the second vote when the odd one out is caught', () => {
    const s = caughtOne({ way: 'odd' });
    expect(s.phase).toBe('second');
    expect(s.endedBy).toBe('caught');
  });

  it('never let the caught impostor vote again or be named again', () => {
    let s = couchGuess(caughtOne(), 0);
    expect(couchVoter(s)).toBe(0);
    expect(couchCastVote(s, 1)).toBe(s);
    expect(couchCastVote(s, 0)).toBe(s);
    s = couchCastVote(s, 4);
    expect(couchVoter(s)).toBe(2);
    const open = couchGuess(caughtOne({ vote: 'open' }), 0);
    expect(couchPoint(open, 1)).toBe(open);
  });

  it('pay the room’s right votes when the second is found, and nothing more to the second', () => {
    const s = [4, 4, 4, 0, 4].reduce((x, v) => couchCastVote(x, v), couchGuess(caughtOne(), caughtOne().options.indexOf('hesp')));
    expect(s.phase).toBe('reveal');
    const { rightVote, caught } = IMPOSTOR_POINTS;
    // seats 0, 2, 3 and 5 named seat 1 in the first vote and seat 4 in the second (seat 4's own vote counts for nothing)
    const found = rightVote + caught + rightVote;
    expect(couchScores(s)).toEqual([found, 0, found, found, 0, found]);
    expect(couchReveal(s)).toMatchObject({
      second: { accused: 4, caught: true, votes: [{ seat: 0, for: 4 }, { seat: 2, for: 4 }, { seat: 3, for: 4 }, { seat: 4, for: 0 }, { seat: 5, for: 4 }] },
      stillHidden: null,
    });
  });

  it('pay an impostor still hidden after the second vote, or when its clock runs out', () => {
    const start = couchGuess(caughtOne(), caughtOne().options.indexOf('pisîk'));
    // seats 3 and 0 share the top: the room could not agree
    const missed = [3, 3, 0, 0, 2].reduce((x, v) => couchCastVote(x, v), start);
    expect(couchScores(missed)[4]).toBe(IMPOSTOR_POINTS.escaped);
    expect(couchScores(missed)[1]).toBe(IMPOSTOR_POINTS.guessedWord);
    expect(couchReveal(missed)?.stillHidden).toBe(4);
    const late = couchSecondTimeUp(couchCastVote(start, 4));
    expect(late.phase).toBe('reveal');
    // one vote in, for the right seat, is the most votes alone at the top
    expect(couchReveal(late)).toMatchObject({ second: { accused: 4, caught: true }, stillHidden: null });
    const silent = couchSecondTimeUp(couchGuess(caughtOne({ vote: 'open' }), 0));
    expect(couchReveal(silent)?.stillHidden).toBe(4);
    expect(couchSecondTimeUp(round())).toEqual(round());
  });

  it('are both paid at once when the first vote catches neither, with no second vote', () => {
    const s = voted(round(6, { impostors: 2 }, [1, 4]), [2, 2, 3, 2, 2, 2]);
    expect(s.phase).toBe('reveal');
    expect(s.second).toBeNull();
    expect(couchReveal(s)?.stillHidden).toBeNull();
  });
});
