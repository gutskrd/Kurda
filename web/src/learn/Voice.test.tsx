import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveredExercise, RecordingVoice } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { LESSON_PATHS, SessionPlayer } from './SessionPlayer';
import { exerciseClips, promptWords } from './Voice';

/*
 * Who says a lesson's recordings: the character an editor chose shows beside
 * what plays it, and a recording with none changes nothing.
 */

const CLIP = 'https://cdn.test/listen.m4a';
const MODEL = 'https://cdn.test/model.m4a';
const hamo: RecordingVoice = { speaker: 'hamo' };
const xezo: RecordingVoice = { speaker: 'xezo' };

let grade: Record<string, unknown> = { verdict: 'correct', accepted: true, duplicate: false };

beforeEach(() => {
  grade = { verdict: 'correct', accepted: true, duplicate: false };
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      if (init?.method === 'POST' && path.endsWith('/answers')) return jsonResponse(200, grade);
      return jsonResponse(404, { code: 'NOT_FOUND', message: 'no' });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function lesson(exercise: DeliveredExercise): void {
  renderApp(
    <SessionPlayer
      session={{ sessionId: 's1', exercises: [exercise] }}
      kind="lesson"
      paths={LESSON_PATHS}
      dialect="kurmanji"
      exitTo="/app/learn"
      exitLabel="Back to Learn"
      onPractise={vi.fn()}
    />,
    ['/app/learn/lesson/l1'],
  );
}

const speakers = (): Element[] => [...document.querySelectorAll('.speaking-character')];

describe('a lesson’s speaking characters', () => {
  it('puts the chosen character beside a listening clip’s buttons', async () => {
    lesson({ id: 'e1', type: 'listening', audioUrl: CLIP, audioVoice: hamo });
    const play = await screen.findByRole('button', { name: 'Play' });
    const voice = play.closest('.character-stage')!;
    expect(voice).not.toBeNull();
    const face = voice.querySelector('.speaking-character')!;
    expect(face).toHaveAttribute('data-speaker', 'hamo');
    // the buttons already say what is heard
    expect(face).toHaveAttribute('aria-hidden', 'true');
    expect(speakers()).toHaveLength(1);
  });

  it('shows nobody for a clip with no character', async () => {
    lesson({ id: 'e1', type: 'listening', audioUrl: CLIP });
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(document.querySelector('.character-stage')).toBeNull();
    expect(speakers()).toHaveLength(0);
  });

  it('puts the speaker of a speaking item’s model beside the phrase to say', async () => {
    lesson({ id: 'e1', type: 'speaking', prompt: 'Bêje: Ez baş im', modelAudioUrl: MODEL, modelAudioVoice: xezo });
    const model = await screen.findByRole('button', { name: /native speaker/i });
    expect(model.closest('.character-stage')?.querySelector('.speaking-character')).toHaveAttribute('data-speaker', 'xezo');
    expect(within(model.closest('.character-stage') as HTMLElement).getByText('Bêje: Ez baş im')).toBeInTheDocument();
  });

  it('has the options’ speaker say them', async () => {
    lesson({
      id: 'e1',
      type: 'multiple_choice',
      prompt: 'Which word means “sister”?',
      options: ['xwişk', 'bira'],
      audio: { xwişk: 'https://cdn.test/xwisk.m4a', bira: 'https://cdn.test/bira.m4a' },
      audioVoices: { xwişk: hamo },
    });
    await screen.findByText('Which word means “sister”?');
    expect(speakers().map((s) => s.getAttribute('data-speaker'))).toEqual(['hamo']);
  });

  it('shows the model’s speaker after an answer when the exercise above did not', async () => {
    grade = { verdict: 'correct', accepted: true, duplicate: false, modelAudioUrl: MODEL, modelAudioVoice: xezo };
    lesson({ id: 'e1', type: 'translate', prompt: 'My sister is at home.' });
    expect(speakers()).toHaveLength(0);
    await userEvent.type(await screen.findByRole('textbox'), 'Xwişka min li malê ye{Enter}');
    const panel = await screen.findByRole('region', { name: 'Feedback' });
    expect(panel.querySelector('.speaking-character')).toHaveAttribute('data-speaker', 'xezo');
  });

  it('does not show the same speaker twice when the feedback plays the exercise’s own clip', async () => {
    grade = { verdict: 'correct', accepted: true, duplicate: false, modelAudioUrl: CLIP, modelAudioVoice: hamo };
    lesson({ id: 'e1', type: 'listening', audioUrl: CLIP, audioVoice: hamo });
    await userEvent.type(await screen.findByRole('textbox'), 'silav{Enter}');
    await screen.findByRole('region', { name: 'Feedback' });
    expect(speakers()).toHaveLength(1);
  });
});

describe('exerciseClips', () => {
  it('lists the recordings that have a character, with the words each says where the exercise has them', () => {
    const clips = exerciseClips({
      id: 'e1',
      type: 'multiple_choice',
      prompt: '“Roj baş” tê çi wateyê?',
      modelAudioUrl: MODEL,
      modelAudioVoice: hamo,
      audio: { a: 'https://cdn.test/a.m4a', b: 'https://cdn.test/b.m4a' },
      audioVoices: { b: xezo },
    });
    expect(clips).toEqual([
      { src: MODEL, voice: hamo, text: 'Roj baş' },
      { src: 'https://cdn.test/b.m4a', voice: xezo, text: 'b' },
    ]);
  });

  it('lists a conversation’s recorded lines, each said by its own part’s character with its own words', () => {
    const clips = exerciseClips({
      id: 'e1',
      type: 'conversation',
      speakers: [
        { name: 'Xezo', character: 'xezo' },
        { name: 'Hamo', character: 'hamo' },
      ],
      lines: [
        { speaker: 0, text: 'Silav!' },
        { speaker: 1, text: 'Silav, Xezo.' },
        { speaker: 0, text: 'Tu çawa yî?' },
      ],
      lineAudio: ['https://cdn.test/0.m4a', 'https://cdn.test/1.m4a', null],
      // the first saved under Hamo's voice by mistake, the second under none
      lineVoices: [hamo, null, null],
    });
    expect(clips).toEqual([
      { src: 'https://cdn.test/0.m4a', voice: { ...hamo, speaker: 'xezo' }, text: 'Silav!' },
      { src: 'https://cdn.test/1.m4a', voice: { speaker: 'hamo' }, text: 'Silav, Xezo.' },
    ]);
  });

  it('reads the quoted words of a prompt, or the prompt itself', () => {
    expect(promptWords('“Roj baş” tê çi wateyê?')).toBe('Roj baş');
    expect(promptWords('Ez baş im')).toBe('Ez baş im');
    expect(promptWords(undefined)).toBeNull();
  });
});
