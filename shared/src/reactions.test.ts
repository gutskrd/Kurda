import { describe, expect, it } from 'vitest';
import { APP_LOCALE_CODES } from './locales.js';
import { conversationLineKey, isConversationLineKey } from './conversation.js';
import { lessonAudioKey, LESSON_AUDIO_TEXT_MAX } from './lesson-audio.js';
import {
  REACTION_CHARACTERS,
  REACTION_GAP_MS,
  REACTION_LINES,
  REACTION_MOMENTS,
  REACTION_REST_MS,
  REACTION_VOICE,
  createReactionGate,
  endMoment,
  isReactionKey,
  pickReaction,
  reactionDelayMs,
  reactionKey,
  reactionLine,
  reactionMeaning,
  streakMoment,
  verdictMoment,
  verdictVoice,
  type ReactionTake,
} from './reactions.js';

/** The most reaction lines one person records, so each stays within the owner's limit alongside their lessons. */
const MOST_EACH = 60;

describe('the reaction catalogue', () => {
  it('keeps each character within the limit, every id once, and every line short enough to record', () => {
    for (const c of REACTION_CHARACTERS) {
      const theirs = REACTION_LINES.filter((l) => l.character === c);
      expect(theirs.length).toBeGreaterThan(0);
      expect(theirs.length).toBeLessThanOrEqual(MOST_EACH);
      expect(new Set(theirs.map((l) => l.id)).size).toBe(theirs.length);
    }
    for (const l of REACTION_LINES) {
      expect(l.id).toMatch(new RegExp(`^${l.moment}-\\d+$`));
      expect(lessonAudioKey(l.ku)).not.toBe('');
      expect(l.ku.length).toBeLessThan(LESSON_AUDIO_TEXT_MAX);
      // Hevalo's are a few words at most.
      if (l.character === 'hevalo') expect(l.ku.split(/\s+/).length).toBeLessThanOrEqual(5);
    }
  });

  it('gives every moment two to five variants from whoever speaks it when nobody is on screen', () => {
    for (const m of REACTION_MOMENTS) {
      const n = REACTION_LINES.filter((l) => l.character === REACTION_VOICE[m] && l.moment === m).length;
      expect(n, m).toBeGreaterThanOrEqual(2);
      expect(n, m).toBeLessThanOrEqual(5);
    }
  });

  it('says what each line means in every interface language', () => {
    for (const l of REACTION_LINES) {
      for (const locale of APP_LOCALE_CODES) expect(reactionMeaning(l, locale).trim(), `${l.character} ${l.id} ${locale}`).not.toBe('');
    }
    const aferin = reactionLine('hevalo', 'run-3-1')!;
    expect(reactionMeaning(aferin, 'ku')).toBe('Aferîn!');
    expect(reactionMeaning(aferin, 'en')).toBe('Well done!');
  });
});

describe('reactionKey', () => {
  it('files the same words by two characters as two takes, apart from every other kind of key', () => {
    const hevalo = reactionKey({ character: 'hevalo', id: 'miss-1', ku: 'Ne xem e!' });
    const xezo = reactionKey({ character: 'xezo', id: 'miss-1', ku: 'Ne xem e!' });
    expect(hevalo).not.toBe(xezo);
    expect(isReactionKey(hevalo)).toBe(true);
    expect(isReactionKey(lessonAudioKey('Ne xem e!'))).toBe(false);
    const line = conversationLineKey('reaction', 0, 'Ne xem e!');
    expect(isReactionKey(line)).toBe(false);
    expect(isConversationLineKey(line)).toBe(true);
    expect(isConversationLineKey(hevalo)).toBe(false);
  });

  it('changes with the words but not with their punctuation or case', () => {
    const at = (ku: string) => reactionKey({ character: 'hevalo', id: 'run-3-1', ku });
    expect(at('Aferîn!')).toBe(at('aferîn'));
    expect(at('Aferîn!')).not.toBe(at('Pir baş!'));
  });
});

describe('pickReaction', () => {
  const take = (character: 'hevalo' | 'xezo', id: string): ReactionTake => ({ character, id, src: `https://cdn.test/${character}/${id}.wav`, voice: { speaker: character } });
  const takes = [take('hevalo', 'run-3-1'), take('hevalo', 'run-3-2'), take('xezo', 'run-3-1'), take('hevalo', 'miss-1'), take('hevalo', 'gone-1')];

  it('plays a recorded variant of that character’s moment, or nothing when none is recorded', () => {
    expect(pickReaction(takes, 'run-3', 'xezo')).toMatchObject({ character: 'xezo', id: 'run-3-1', line: { ku: 'Pir baş e!' } });
    expect(pickReaction(takes, 'miss', 'hevalo', null, () => 0.99)?.id).toBe('miss-1');
    expect(pickReaction(takes, 'perfect', 'hevalo')).toBeNull();
    expect(pickReaction([], 'run-3', 'hevalo')).toBeNull();
  });

  it('never repeats the last variant while another is recorded', () => {
    for (const r of [0, 0.5, 0.99]) expect(pickReaction(takes, 'run-3', 'hevalo', 'run-3-1', () => r)?.id).toBe('run-3-2');
    expect(pickReaction(takes, 'miss', 'hevalo', 'miss-1')?.id).toBe('miss-1');
  });
});

describe('createReactionGate', () => {
  it('says a moment once while it rests and leaves a gap after any line', () => {
    const gate = createReactionGate();
    expect(gate.allow('run-3', 0)).toBe(true);
    gate.said('run-3', 0);
    expect(gate.allow('miss', REACTION_GAP_MS - 1)).toBe(false);
    expect(gate.allow('miss', REACTION_GAP_MS)).toBe(true);
    expect(gate.allow('run-3', REACTION_REST_MS['run-3'] - 1)).toBe(false);
    expect(gate.allow('run-3', REACTION_REST_MS['run-3'])).toBe(true);
    // a lesson’s end comes round again with the next lesson
    gate.said('lesson-done', 100_000);
    expect(gate.allow('lesson-done', 100_000 + REACTION_REST_MS['lesson-done'])).toBe(true);
  });
});

describe('when and who', () => {
  it('times a verdict’s line in the model recording’s slot and a celebration’s once its words land', () => {
    expect(reactionDelayMs('verdict', false)).toBe(350);
    expect(reactionDelayMs('celebration', false)).toBe(740);
    expect(reactionDelayMs('celebration', true)).toBe(200);
  });

  it('names a verdict’s moment', () => {
    expect(verdictMoment({ accepted: false, spoken: false, run: 0, before: 4 })).toBe('miss');
    expect(verdictMoment({ accepted: true, spoken: false, run: 3, before: 2 })).toBe('run-3');
    expect(verdictMoment({ accepted: true, spoken: false, run: 5, before: 4 })).toBe('run-5');
    expect(verdictMoment({ accepted: true, spoken: false, run: 10, before: 9 })).toBe('run-5');
    expect(verdictMoment({ accepted: true, spoken: false, run: 4, before: 3 })).toBeNull();
    expect(verdictMoment({ accepted: false, spoken: true, run: 0, before: 0 })).toBeNull();
    // a spoken answer leaves the run where it was
    expect(verdictMoment({ accepted: true, spoken: false, run: 3, before: 3 })).toBeNull();
  });

  it('lets only the character on screen speak, and nobody over a model recording', () => {
    expect(verdictVoice({ shown: 'hevalo', staged: false, modelDue: false })).toEqual({ character: 'hevalo', drawn: true });
    expect(verdictVoice({ shown: 'xezo', staged: true, modelDue: false })).toEqual({ character: 'xezo', drawn: true });
    expect(verdictVoice({ shown: 'hamo', staged: false, modelDue: false })).toBeNull();
    expect(verdictVoice({ shown: null, staged: true, modelDue: false })).toBeNull();
    expect(verdictVoice({ shown: null, staged: false, modelDue: false })).toEqual({ character: 'hevalo', drawn: false });
    expect(verdictVoice({ shown: 'hevalo', staged: false, modelDue: true })).toBeNull();
  });

  it('names the lesson’s end and the streak card’s day', () => {
    expect(endMoment(true)).toBe('perfect');
    expect(endMoment(false)).toBe('lesson-done');
    expect(streakMoment('start')).toBe('first-day');
    expect(streakMoment('comeback')).toBe('welcome-back');
    expect(streakMoment('best')).toBe('streak-best');
    expect(streakMoment('ordinary')).toBe('streak-kept');
  });
});
