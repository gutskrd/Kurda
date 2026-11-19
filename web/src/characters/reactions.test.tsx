import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveredExercise, PlayableSession, ReactionTake } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { LESSON_PATHS, SessionPlayer } from '../learn/SessionPlayer';
import { soundPlayer } from '../lib/sound';
import { setCharacterVoices, setLessonSounds } from '../lib/sounds';
import { ReactionCaption } from './ReactionCaption';
import { REACTION_VOLUME, hushReactions, resetReactions, sayReaction } from './reactions';

/* Hevalo’s and Xezal’s recorded reactions: when one is heard, who says it, and its caption. */

const take = (character: 'hevalo' | 'xezo', id: string): ReactionTake => ({ character, id, src: `https://cdn.test/${character}-${id}.wav`, voice: { speaker: character } });
const TAKES = [take('hevalo', 'miss-1'), take('hevalo', 'run-3-2'), take('xezo', 'daily-zer-1'), take('xezo', 'miss-1')];

beforeEach(() => {
  resetReactions(TAKES);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sayReaction', () => {
  it('plays a recorded variant through the one player, a little quieter, in the moment’s own voice', () => {
    expect(sayReaction({ moment: 'daily-zer' })).toBe(true);
    expect(soundPlayer()?.src).toBe('https://cdn.test/xezo-daily-zer-1.wav');
    expect(soundPlayer()?.volume).toBe(REACTION_VOLUME);
  });

  it('says nothing with no take recorded, with Character voices or the chime off, or while a lesson is hushed', () => {
    expect(sayReaction({ moment: 'perfect' })).toBe(false);
    setCharacterVoices(false);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    setCharacterVoices(true);
    setLessonSounds(false);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    setLessonSounds(true);
    hushReactions(true);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    hushReactions(false);
    expect(sayReaction({ moment: 'miss' })).toBe(true);
  });

  it('says a moment once while it rests, and nothing right after another line', () => {
    expect(sayReaction({ moment: 'miss' })).toBe(true);
    expect(sayReaction({ moment: 'daily-zer' })).toBe(false);
    resetReactions(TAKES);
    expect(sayReaction({ moment: 'miss' })).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    expect(sayReaction({ moment: 'daily-zer' })).toBe(true);
  });

  it('never plays over something already sounding', () => {
    expect(sayReaction({ moment: 'daily-zer' })).toBe(true);
    const el = soundPlayer()!;
    vi.spyOn(el, 'paused', 'get').mockReturnValue(false);
    resetReactions(TAKES);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
  });
});

describe('the caption', () => {
  it('shows the line with the speaker’s face when nobody is drawn, and what it means on a click', async () => {
    renderApp(<ReactionCaption />);
    act(() => void sayReaction({ moment: 'daily-zer' }));
    const caption = await screen.findByRole('button', { name: /Xezal says “Ji te re zêr!”/ });
    expect(caption.querySelector('.reaction-caption-face [data-speaker="xezo"]')).not.toBeNull();
    expect(caption).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(caption);
    expect(within(caption).getByText('Gold for you!')).toBeInTheDocument();
  });

  it('leaves the face out when the character says it on screen', async () => {
    renderApp(<ReactionCaption />);
    act(() => void sayReaction({ moment: 'miss', character: 'hevalo', drawn: true }));
    const caption = await screen.findByRole('button', { name: /Hevalo says “Ne xem e!”/ });
    expect(caption.querySelector('.reaction-caption-face')).toBeNull();
  });
});

describe('in a lesson', () => {
  let grade: () => unknown;

  beforeEach(() => {
    grade = () => ({ verdict: 'incorrect', accepted: false, duplicate: false, correction: 'sêv' });
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
        if (init?.method === 'POST' && path.endsWith('/answers')) return jsonResponse(200, grade());
        return jsonResponse(404, { code: 'NOT_FOUND', message: 'no' });
      }),
    );
  });

  const choice = (id: string, over: Partial<DeliveredExercise> = {}): DeliveredExercise => ({ id, type: 'multiple_choice', prompt: 'Which is the apple?', options: ['sêv', 'av'], ...over });

  function lesson(exercises: DeliveredExercise[], dialect = 'kurmanji'): void {
    const session: PlayableSession = { sessionId: 's1', exercises, answered: {} };
    renderApp(
      <>
        <SessionPlayer session={session} kind="lesson" paths={LESSON_PATHS} dialect={dialect} exitTo="/app/learn" exitLabel="Back to Learn" onPractise={vi.fn()} />
        <ReactionCaption />
      </>,
      ['/app/learn/lesson/l1'],
    );
  }

  async function answer(): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: 'av' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    await screen.findByRole('region', { name: 'Feedback' });
  }

  it('has Hevalo, beside a miss in his window, say a gentle word once', async () => {
    lesson([choice('a'), choice('b')]);
    await answer();
    await screen.findByRole('button', { name: /Hevalo says “Ne xem e!”/ });
    expect(soundPlayer()?.src).toBe('https://cdn.test/hevalo-miss-1.wav');
    expect(document.querySelector('.reaction-caption-face')).toBeNull();
  });

  it('waits for the answer’s own recording, then comes from Xezal, who says it beside the verdict', async () => {
    const MODEL = 'https://cdn.test/xezo-model.wav';
    grade = () => ({ verdict: 'incorrect', accepted: false, duplicate: false, correction: 'sêv', modelAudioUrl: MODEL, modelAudioVoice: { speaker: 'xezo' } });
    // The answer's recording sounds from the moment it is asked to play until it ends.
    const paused = vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
    lesson([choice('a'), choice('b')]);
    await answer();
    await act(() => new Promise((r) => setTimeout(r, 900)));
    expect(soundPlayer()?.src).toBe(MODEL);
    expect(screen.queryByRole('button', { name: /says/ })).not.toBeInTheDocument();
    paused.mockReturnValue(true);
    act(() => void soundPlayer()!.dispatchEvent(new Event('ended')));
    const caption = await screen.findByRole('button', { name: /Xezal says “Şaşî jî hînbûn e.”/ });
    expect(soundPlayer()?.src).toBe('https://cdn.test/xezo-miss-1.wav');
    expect(caption.querySelector('.reaction-caption-face')).toBeNull();
  });

  it('stays quiet when another character is on the exercise’s stage', async () => {
    const staged = choice('a', { modelAudioUrl: 'https://cdn.test/hamo.wav', modelAudioVoice: { speaker: 'hamo' } });
    lesson([staged]);
    await answer();
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByRole('button', { name: /says/ })).not.toBeInTheDocument();
  });

  it('stays quiet through a Soranî lesson', async () => {
    const before = soundPlayer()?.src;
    lesson([choice('a', { prompt: 'کامە سێوە؟', options: ['سێو', 'av'] })], 'sorani');
    await answer();
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByRole('button', { name: /says/ })).not.toBeInTheDocument();
    expect(soundPlayer()?.src).toBe(before);
  });
});
