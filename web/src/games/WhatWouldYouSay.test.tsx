import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScenarioCorrection, SoloSessionView, WhatWouldYouSayItemView } from '@kurda/shared';
import { WhatWouldYouSay } from './WhatWouldYouSay';
import { Games } from '../pages/Games';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetLastLetterAvailability();
});

const ID = '00000000-0000-4000-8000-0000000000cc';

// stand-in lines, never shown to a learner
const scene = (over: Partial<WhatWouldYouSayItemView> = {}): WhatWouldYouSayItemView => ({
  index: 0,
  situation: { en: 'At the party, a cousin turns to you.' },
  place: 'party',
  speaker: 'hamo',
  line: { ku: 'Tu çend salî yî?', audio: null },
  options: ['Li wir sêv hene!', 'Ez heft salî me.', 'Ez ne hêdî me!'],
  tiles: null,
  level: 1,
  ...over,
});

const session = (dialect: 'kmr' | 'ckb', items: WhatWouldYouSayItemView[], difficulty = 'beginner'): SoloSessionView<WhatWouldYouSayItemView> => ({
  id: ID,
  game: 'what-would-you-say',
  dialect,
  difficulty: difficulty as 'beginner',
  items,
  states: items.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});

const correction: ScenarioCorrection = {
  line: { ku: 'Tu çend salî yî?', meanings: { en: 'How old are you?' } },
  reply: { ku: 'Ez heft salî me.', meanings: { en: 'I am seven.' }, why: null, audio: null },
  options: [
    { ku: 'Li wir sêv hene!', meanings: { en: 'There are apples over there!' }, why: { en: 'That is about apples.' }, fits: false },
    { ku: 'Ez heft salî me.', meanings: { en: 'I am seven.' }, why: null, fits: true },
    { ku: 'Ez ne hêdî me!', meanings: { en: 'I am not slow!' }, why: null, fits: false },
  ],
  chosen: 1,
  firstWrong: null,
};

interface Sent {
  index: number;
  answer: { choice?: number; order?: number[] };
  attempt: number;
}

function server(round: SoloSessionView<WhatWouldYouSayItemView>, grade: (a: Sent) => unknown, available = true) {
  const sent: Sent[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      if (url.includes('/games/availability'))
        return jsonResponse(200, {
          dialect: round.dialect,
          games: [{ id: 'what-would-you-say', available, difficulties: available ? ['beginner', 'advanced'] : [], levels: {}, levelled: true, minimum: 8 }],
        });
      if (url.includes('/mp/last-letter/availability')) return jsonResponse(200, { dialects: [] });
      if (url.includes('/games/solo/open')) return jsonResponse(200, { id: null });
      if (url.endsWith('/games/solo/sessions')) return jsonResponse(201, round);
      if (url.includes('/answers')) {
        const body = JSON.parse(String(init?.body)) as Sent;
        sent.push(body);
        return jsonResponse(200, grade(body));
      }
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

describe('What Would You Say?', () => {
  it('stages the scene: the place, the situation, who speaks and their line in a bubble', async () => {
    server(session('kmr', [scene()]), () => ({}));
    renderApp(<WhatWouldYouSay />, ['/app/games/what-would-you-say']);
    expect(await screen.findByRole('heading', { name: 'What Would You Say?' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('At a celebration')).toBeInTheDocument();
    expect(screen.getByText('At the party, a cousin turns to you.')).toBeInTheDocument();
    const bubble = screen.getByRole('group', { name: 'Hamo says' });
    expect(within(bubble).getByText('Tu çend salî yî?')).toHaveAttribute('lang', 'ku');
    const replies = screen.getByRole('group', { name: 'Replies to choose from' });
    expect(within(replies).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('rules a wrong reply out with what it means, then explains every option once it is done', async () => {
    const sent = server(session('kmr', [scene()]), (a) =>
      a.attempt === 1
        ? { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { ruledOut: 0, meanings: { en: 'There are apples over there!' }, firstWrong: null }, correction: null, why: null, xp: 0, repeat: false }
        : { index: 0, attempt: 2, correct: true, firstTry: false, done: true, hint: null, correction, why: 'reply', xp: 1, repeat: false },
    );
    renderApp(<WhatWouldYouSay />, ['/app/games/what-would-you-say']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const replies = await screen.findByRole('group', { name: 'Replies to choose from' });
    await userEvent.click(within(replies).getByRole('button', { name: 'Li wir sêv hene!' }));
    expect(within(replies).getByRole('button', { name: 'Li wir sêv hene!' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(sent[0]).toMatchObject({ index: 0, answer: { choice: 0 }, attempt: 1 });
    expect(await screen.findByText('That doesn’t answer it. It means: “There are apples over there!”')).toBeInTheDocument();
    expect(within(replies).getByRole('button', { name: 'Li wir sêv hene!' })).toBeDisabled();

    await userEvent.click(within(replies).getByRole('button', { name: 'Ez heft salî me.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(sent[1]).toMatchObject({ answer: { choice: 1 }, attempt: 2 });
    expect(await screen.findByText('In the conversation, this is what was really said next.')).toBeInTheDocument();
    expect(screen.getByText('They said: “How old are you?”')).toBeInTheDocument();
    const explained = screen.getAllByRole('listitem').filter((li) => li.classList.contains('ws-explain'));
    // the real reply first, then the others, each with what it means and why
    expect(within(explained[0]!).getByText('The real reply')).toBeInTheDocument();
    expect(within(explained[0]!).getByText('It answers what was said: it is what came next in the conversation.')).toBeInTheDocument();
    expect(within(explained[1]!).getByText('That is about apples.')).toBeInTheDocument();
    expect(within(explained[2]!).getByText('It is a real line, but from another conversation, and it doesn’t answer this one.')).toBeInTheDocument();
  });

  it('builds the reply from its words at the advanced level, and marks where a line goes astray', async () => {
    const sent = server(session('kmr', [scene({ options: null, tiles: ['me', 'heft', 'Ez', 'salî', 'sêv'] })], 'advanced'), () => ({
      index: 0,
      attempt: 1,
      correct: false,
      firstTry: false,
      done: false,
      hint: { ruledOut: null, meanings: null, firstWrong: 0 },
      correction: null,
      why: null,
      xp: 0,
      repeat: false,
    }));
    renderApp(<WhatWouldYouSay />, ['/app/games/what-would-you-say']);
    await userEvent.click(await screen.findByRole('radio', { name: 'Advanced' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    const tray = await screen.findByRole('group', { name: 'Words to use' });
    await userEvent.click(within(tray).getByRole('button', { name: 'heft' }));
    await userEvent.click(within(tray).getByRole('button', { name: 'Ez' }));
    const line = screen.getByRole('group', { name: 'Your reply' });
    expect(within(line).getAllByRole('button').map((b) => b.textContent)).toEqual(['heft', 'Ez']);
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(sent[0]).toMatchObject({ answer: { order: [1, 2] } });
    expect(await screen.findByText('Look again from the marked word.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('reads a Soranî scene right to left', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    server(session('ckb', [scene({ line: { ku: 'تەمەنت چەندە؟', audio: null }, options: ['حەوت ساڵم', 'سوپاس'] })]), () => ({}));
    renderApp(<WhatWouldYouSay />, ['/app/games/what-would-you-say']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('تەمەنت چەندە؟')).toHaveAttribute('dir', 'rtl');
    expect(within(screen.getByRole('group', { name: 'Replies to choose from' })).getByText('حەوت ساڵم')).toHaveAttribute('lang', 'ckb');
  });
});

describe('What Would You Say? in Learn’s games', () => {
  it('has its way in once it can be played, and is shown as coming soon before', async () => {
    server(session('kmr', [scene()]), () => ({}));
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'What Would You Say?' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/what-would-you-say');
    cleanup();
    server(session('kmr', [scene()]), () => ({}), false);
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    const soon = (await screen.findByRole('heading', { name: 'What Would You Say?' })).closest('article')!;
    expect(within(soon).getByText('Coming soon')).toBeInTheDocument();
    expect(within(soon).queryByRole('link', { name: 'Play' })).toBeNull();
  });
});
