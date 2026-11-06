import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HearItItemView, SoloSessionView } from '@kurda/shared';

/** The one player every sound goes through, as the page sees it: what was played, and a way to say it failed. */
const sound = vi.hoisted(() => ({
  played: [] as string[],
  errors: new Set<(src: string) => void>(),
  playing: new Set<(src: string | null) => void>(),
}));
vi.mock('../lib/sound', () => ({
  play: (src: string) => {
    sound.played.push(src);
    sound.playing.forEach((l) => l(src));
  },
  stop: () => undefined,
  onPlaying: (l: (src: string | null) => void) => {
    sound.playing.add(l);
    return () => sound.playing.delete(l);
  },
  onError: (l: (src: string) => void) => {
    sound.errors.add(l);
    return () => sound.errors.delete(l);
  },
}));

import { HearIt } from './HearIt';
import { Games } from '../pages/Games';
import { jsonResponse, renderApp } from '../test/utils';

beforeEach(() => {
  sound.played = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const ID = '00000000-0000-4000-8000-0000000000dd';
const CLIP = 'Zm9vYmFyYmF6cXV4cXV1eA';

// stand-in words for the stage, never shown to a learner
const item = (over: Partial<HearItItemView> = {}): HearItItemView => ({
  index: 0,
  stage: 'word',
  clip: CLIP,
  replays: 2,
  options: ['bar', 'dar', 'ber', 'bêr'],
  meanings: null,
  speaker: null,
  newVoice: false,
  level: 1,
  ...over,
});

const session = (items: HearItItemView[], dialect: 'kmr' | 'ckb' = 'kmr'): SoloSessionView<HearItItemView> => ({
  id: ID,
  game: 'hear-it',
  dialect,
  difficulty: 'beginner',
  items,
  states: items.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});

interface Answer {
  index: number;
  answer: { choice?: number; text?: string };
  attempt: number;
}

function server(round: SoloSessionView<HearItItemView>, grade: (a: Answer) => unknown, available = true) {
  const sent: Answer[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      if (url.includes('/games/availability'))
        return jsonResponse(200, {
          dialect: round.dialect,
          games: [{ id: 'hear-it', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: false, minimum: 20 }],
        });
      if (url.includes('/games/solo/open')) return jsonResponse(200, { id: null });
      if (url.endsWith('/games/solo/sessions')) return jsonResponse(201, round);
      if (url.includes('/answers')) {
        const body = JSON.parse(String(init?.body)) as Answer;
        sent.push(body);
        return jsonResponse(200, grade(body));
      }
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

const done = (over: Record<string, unknown> = {}) => ({
  index: 0,
  attempt: 2,
  correct: true,
  firstTry: false,
  done: true,
  hint: null,
  correction: { text: 'Bar', meanings: { en: 'load' }, verdict: 'right', choice: 0, speaker: null },
  why: 'word',
  xp: 1,
  repeat: false,
  ...over,
});

describe('Hear It, Find It', () => {
  it('opens on the ladder a round climbs', async () => {
    server(session([item()]), () => ({}));
    renderApp(<HearIt />, ['/app/games/hear-it']);
    expect(await screen.findByRole('heading', { name: 'Hear It, Find It' })).toBeInTheDocument();
    const ladder = (await screen.findByRole('heading', { name: 'How a round climbs' })).closest('section')!;
    expect(within(ladder).getAllByRole('listitem')).toHaveLength(4);
    expect(within(ladder).getByText('Type what you hear')).toBeInTheDocument();
    expect(await screen.findByText('Up to 16 XP')).toBeInTheDocument();
  });

  it('plays the clip from its round’s handle, and counts the replays down', async () => {
    server(session([item()]), () => ({}));
    renderApp(<HearIt />, ['/app/games/hear-it']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Find the word')).toBeInTheDocument();
    // played as it opens, from an address that names the round and the handle only
    expect(sound.played).toHaveLength(1);
    expect(sound.played[0]).toMatch(new RegExp(`/games/solo/sessions/${ID}/clips/${CLIP}$`));
    for (const option of ['bar', 'dar', 'ber', 'bêr']) expect(sound.played[0]).not.toContain(option);

    expect(screen.getByText('Replays left: 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play it again' }));
    expect(screen.getByText('Replays left: 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play it again' }));
    expect(screen.getByText('No replays left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play it again' })).toBeDisabled();
    expect(sound.played).toHaveLength(3);
  });

  it('gives a play back when the recording would not play', async () => {
    server(session([item()]), () => ({}));
    renderApp(<HearIt />, ['/app/games/hear-it']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByText('Replays left: 2');
    act(() => sound.errors.forEach((l) => l(sound.played[0]!)));
    expect(screen.getByText('This recording didn’t play. Try the play button again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play the recording' })).toBeEnabled();
  });

  it('strikes a wrong pick out, then shows what was said, and plays freely once done', async () => {
    const sent = server(session([item({ speaker: 'hamo', newVoice: true })]), (a) =>
      a.attempt === 1
        ? { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { struck: 1, right: null }, correction: null, why: null, xp: 0, repeat: false }
        : done(),
    );
    renderApp(<HearIt />, ['/app/games/hear-it']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Hamo speaking')).toBeInTheDocument();
    expect(screen.getByText('A new voice')).toBeInTheDocument();

    const choices = screen.getByRole('group', { name: 'Choices' });
    await userEvent.click(within(choices).getByRole('button', { name: 'dar' }));
    expect(sent[0]).toMatchObject({ index: 0, attempt: 1, answer: { choice: 1 } });
    expect(await screen.findByText('Not that one. Listen again and choose another.')).toBeInTheDocument();
    expect(within(choices).getByRole('button', { name: /dar/ })).toBeDisabled();

    await userEvent.click(within(choices).getByRole('button', { name: 'bar' }));
    expect(sent[1]).toMatchObject({ attempt: 2, answer: { choice: 0 } });
    const said = await screen.findByRole('region', { name: 'What was said' });
    expect(within(said).getByText('Bar')).toBeInTheDocument();
    expect(within(said).getByText('load')).toBeInTheDocument();
    expect(screen.getByText('Listen as often as you like')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play it again' })).toBeEnabled();
    expect(screen.getByText(/differ by a single sound/)).toBeInTheDocument();
  });

  it('asks what a phrase means in the reader’s own language', async () => {
    server(session([item({ stage: 'phrase', options: null, meanings: [{ en: 'Good morning', de: 'Guten Morgen' }, { en: 'Good night' }, { en: 'Thank you' }, { en: 'See you' }] })]), () => ({}));
    renderApp(<HearIt />, ['/app/games/hear-it']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const choices = await screen.findByRole('group', { name: 'Choices' });
    expect(within(choices).getByRole('button', { name: 'Good morning' })).toHaveAttribute('lang', 'en');
    expect(screen.getByText('What does it mean?')).toBeInTheDocument();
  });

  it('takes a typed answer with the key bar, and marks the words right where they stand', async () => {
    const sent = server(session([item({ stage: 'type', options: null, replays: 1, level: 5 })]), (a) =>
      a.attempt === 1
        ? { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { struck: null, right: [true, false] }, correction: null, why: null, xp: 0, repeat: false }
        : done({ correction: { text: 'Ez diçim malê.', meanings: { en: 'I am going home.' }, verdict: 'typo', choice: null, speaker: null }, why: 'type' }),
    );
    renderApp(<HearIt />, ['/app/games/hear-it']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const field = await screen.findByRole('textbox', { name: 'What you heard' });
    expect(screen.getByRole('group', { name: 'Kurdish letters' })).toBeInTheDocument();
    await userEvent.type(field, 'ez diçim bajêr');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(sent[0]).toMatchObject({ answer: { text: 'ez diçim bajêr' } });
    const marks = await screen.findByRole('list', { name: /Ticked words are right/ });
    expect(within(marks).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.clear(field);
    await userEvent.type(field, 'ez dicim male');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(sent[1]).toMatchObject({ attempt: 2, answer: { text: 'ez dicim male' } });
    expect(await screen.findByText('Accepted — mind the marks')).toBeInTheDocument();
    expect(screen.getByText('I am going home.')).toBeInTheDocument();
  });

  it('sets Soranî choices right to left', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    server(session([item({ options: ['ماڵ', 'باڵ', 'کاڵ', 'خاڵ'] })], 'ckb'), () => ({}));
    renderApp(<HearIt />, ['/app/games/hear-it']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const choices = await screen.findByRole('group', { name: 'Choices' });
    for (const b of within(choices).getAllByRole('button')) {
      expect(b).toHaveAttribute('dir', 'rtl');
      expect(b).toHaveAttribute('lang', 'ckb');
    }
  });
});

describe('Learn’s games list', () => {
  it('lists Hear It, Find It once it can be played', async () => {
    server(session([item()]), () => ({}));
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'Hear It, Find It' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/hear-it');
  });
});
