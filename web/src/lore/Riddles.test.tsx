import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderApp } from '../test/utils';
import { SECRET, riddleAnswer, riddleCard, riddleDetail, riddleHint, riddleList } from '../test/loreFixtures';
import { fakeApi, type Call } from '../stories/testing';
import { resetSessionVariety } from '../stories/prefs';
import { forgetVisitorRiddles } from './api';
import { RiddlesList } from './RiddlesList';
import { RiddlePage } from './RiddlePage';
import { RiddleAnswerPage } from './RiddleAnswer';

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
  localStorage.clear();
  forgetVisitorRiddles();
  resetSessionVariety();
});

const pages = (entry: string) =>
  renderApp(
    <Routes>
      <Route path="/app/learn/riddles" element={<RiddlesList />} />
      <Route path="/app/learn/riddles/:slug" element={<RiddlePage />} />
      <Route path="/app/learn/riddles/:slug/answer" element={<RiddleAnswerPage />} />
      <Route path="/app/learn/stories" element={<p>the stories</p>} />
      <Route path="/app/learn/proverbs" element={<p>the proverbs</p>} />
    </Routes>,
    [entry],
  );

/**
 * The server as it is: the list and a riddle's page carry questions alone,
 * and the marked hint, answer and explanation come only from the hint, guess
 * and reveal calls — so if any of them is on the page, the page asked.
 */
function server(opts: { signedIn?: boolean; detail?: Parameters<typeof riddleDetail>[0]; guessRight?: string } = {}) {
  const detail = riddleDetail(opts.detail);
  return fakeApi(
    {
      'GET /riddles': riddleList(),
      'GET /riddles/kmr-sih': { riddle: detail },
      'POST /riddles/kmr-sih/hint': (c: Call) => ({ hint: riddleHint((c.body as { index: number }).index) }),
      'POST /riddles/kmr-sih/guess': (c: Call) =>
        (c.body as { guess: string }).guess === (opts.guessRight ?? 'sî')
          ? { correct: true, answer: riddleAnswer(), xp: 3 }
          : (c.body as { guess: string }).guess === 'sîh'
            ? { correct: false, near: 'spelling' }
            : { correct: false },
      'POST /riddles/kmr-sih/reveal': { answer: riddleAnswer() },
    },
    { signedIn: opts.signedIn ?? true },
  );
}

/** Everything the page holds: its markup, every attribute (titles, labels) included. */
const markup = (): string => document.body.innerHTML;
const leaks = (): string[] => Object.values(SECRET).filter((s) => markup().includes(s.split(' ')[0]!));
const asked = (calls: Call[], pattern: RegExp): Call[] => calls.filter((c) => c.method === 'POST' && pattern.test(c.path));

describe('the riddles: nothing spoils a riddle before it is asked for', () => {
  it('the list holds questions alone: no hint, answer or explanation in its markup, and it asks for none', async () => {
    const { calls } = server();
    pages('/app/learn/riddles');
    await screen.findByRole('region', { name: 'Riddle of the day' });
    expect(screen.getAllByText('Bi te re tê, lê qet nayê girtin. Ew çi ye?').length).toBeGreaterThan(0);
    // the translations, too, once they are asked for
    await userEvent.click(screen.getByRole('button', { name: 'Show translations' }));
    expect(screen.getByText('It comes with you, but can never be caught. What is it?')).toBeInTheDocument();
    expect(leaks()).toEqual([]);
    expect(asked(calls, /\/(hint|guess|reveal)$/)).toEqual([]);
    // and nothing fetched any riddle's page ahead of time
    expect(calls.filter((c) => c.path.startsWith('/riddles/'))).toEqual([]);
  });

  it('a riddle’s page holds its question alone until a hint, a guess or the answer is asked for', async () => {
    const { calls } = server();
    pages('/app/learn/riddles/kmr-sih');
    await screen.findByRole('heading', { level: 1, name: 'Bi te re tê, lê qet nayê girtin. Ew çi ye?' });
    expect(leaks()).toEqual([]);
    expect(asked(calls, /\/(hint|guess|reveal)$/)).toEqual([]);

    // one hint, from the hint call, and still no answer
    await userEvent.click(screen.getByRole('button', { name: 'Show a hint' }));
    expect(await screen.findByText(`${SECRET.hint} 1`)).toBeInTheDocument();
    expect(screen.getByText(`${SECRET.hintEn} 1`)).toBeInTheDocument();
    expect(screen.queryByText(`${SECRET.hint} 2`)).toBeNull();
    expect(asked(calls, /\/hint$/).map((c) => c.body)).toEqual([{ index: 0 }]);
    expect(markup()).not.toContain('ANSWERWORD');
    expect(markup()).not.toContain('EXPLAINWORD');
    // the next one is the next one, never two at once
    await userEvent.click(screen.getByRole('button', { name: 'Show another hint' }));
    expect(await screen.findByText(`${SECRET.hint} 2`)).toBeInTheDocument();
    expect(asked(calls, /\/hint$/).map((c) => c.body)).toEqual([{ index: 0 }, { index: 1 }]);
    expect(screen.queryByRole('button', { name: /another hint/ })).toBeNull();
    expect(markup()).not.toContain('ANSWERWORD');
  });

  it('a learner’s own hints come back with the page, and no more than those', async () => {
    server({ detail: { hintsUsed: [riddleHint(0)], state: 'trying' } });
    pages('/app/learn/riddles/kmr-sih');
    expect(await screen.findByText(`${SECRET.hint} 1`)).toBeInTheDocument();
    expect(screen.queryByText(`${SECRET.hint} 2`)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show another hint' })).toBeInTheDocument();
  });
});

describe('the riddles’ list', () => {
  it('puts the riddle of the day first, then every riddle with its difficulty, category and state, and the solved count', async () => {
    server();
    pages('/app/learn/riddles');
    const daily = await screen.findByRole('region', { name: 'Riddle of the day' });
    expect(within(daily).getByText('Mala min a spî ye, derî tune ye.')).toHaveAttribute('lang', 'ku');
    expect(within(daily).getByRole('link', { name: 'Open it again' })).toHaveAttribute('href', '/app/learn/riddles/kmr-hek');
    expect(screen.getByRole('progressbar', { name: 'Riddles solved' })).toHaveAttribute('aria-valuetext', 'Solved: 1 of 3');

    const all = screen.getByRole('region', { name: 'All riddles' });
    const rows = within(all).getAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/app/learn/riddles/kmr-sih', '/app/learn/riddles/kmr-hek', '/app/learn/riddles/kmr-sterk']);
    expect(within(rows[0]!).getByText('Easy')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Nature')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Solved')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Today’s')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Answer seen')).toBeInTheDocument();
  });

  it('narrows to one difficulty, and the address keeps it', async () => {
    server();
    pages('/app/learn/riddles');
    const all = await screen.findByRole('region', { name: 'All riddles' });
    await userEvent.click(within(all).getByRole('radio', { name: /Hard/ }));
    expect(within(all).getAllByRole('link')).toHaveLength(1);
    expect(within(all).getByText('Bi şev tên, bi roj diçin.')).toBeInTheDocument();
    await userEvent.click(within(all).getByRole('radio', { name: /All/ }));
    expect(within(all).getAllByRole('link')).toHaveLength(3);
  });

  it('asks for the other variety when it is chosen', async () => {
    const { calls } = server();
    pages('/app/learn/riddles');
    await screen.findByRole('region', { name: 'All riddles' });
    await userEvent.click(screen.getByRole('radio', { name: 'Soranî' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/riddles?dialect=ckb')).toBe(true));
  });

  it('tells a visitor once, gently, what an account keeps, and shows no solved count', async () => {
    server({ signedIn: false });
    pages('/app/learn/riddles');
    await screen.findByRole('region', { name: 'Riddle of the day' });
    expect(screen.getByText(/Playing is free/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('sits among the Stories section’s shelves, on its own', async () => {
    server();
    pages('/app/learn/riddles');
    const shelves = await screen.findByRole('navigation', { name: 'Stories, riddles or proverbs' });
    const links = within(shelves).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/app/learn/stories', '/app/learn/riddles', '/app/learn/proverbs']);
    expect(links[1]).toHaveAttribute('aria-current', 'page');
    expect(within(links[1]!).getByText('Metelok')).toHaveAttribute('lang', 'ku');
    expect(within(links[1]!).getByText('Riddles')).toBeInTheDocument();
  });
});

describe('a riddle', () => {
  it('says kindly when a guess is not it, and lets them try again', async () => {
    const { calls } = server();
    pages('/app/learn/riddles/kmr-sih');
    const field = await screen.findByLabelText('Your answer');
    expect(field).toHaveAttribute('lang', 'ku');
    await userEvent.type(field, 'av');
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await screen.findByText('Not quite. Have another think.')).toBeInTheDocument();
    // the same guess twice is not sent twice
    expect(screen.getByRole('button', { name: 'Guess' })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, 'ba');
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await screen.findByText('Not this one either. A hint might help.')).toBeInTheDocument();
    expect(asked(calls, /\/guess$/).map((c) => c.body)).toEqual([{ guess: 'av', locale: 'en' }, { guess: 'ba', locale: 'en' }]);
    expect(markup()).not.toContain('ANSWERWORD');
  });

  it('says when a guess is nearly it, without giving the answer away', async () => {
    server();
    pages('/app/learn/riddles/kmr-sih');
    const field = await screen.findByLabelText('Your answer');
    await userEvent.type(field, 'sîh');
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await screen.findByText('Almost: check the spelling.')).toBeInTheDocument();
  });

  it('a right guess opens the answer on the moment it was solved, with the XP the server paid', async () => {
    const { calls } = server();
    pages('/app/learn/riddles/kmr-sih');
    await userEvent.type(await screen.findByLabelText('Your answer'), 'sî');
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await screen.findByText('You got it.')).toBeInTheDocument();
    expect(screen.getByText('+3 XP')).toBeInTheDocument();
    expect(screen.getByText(SECRET.answer)).toHaveAttribute('lang', 'ku');
    expect(screen.getByText(SECRET.answerEn)).toBeInTheDocument();
    expect(screen.getByText(SECRET.explanation)).toBeInTheDocument();
    expect(screen.getByText('A traditional riddle, as it is told in Botan.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Metelokên Kurdî' })).toHaveAttribute('href', 'https://example.org/metelok');
    // the answer came with the guess: nothing was revealed
    expect(asked(calls, /\/reveal$/)).toEqual([]);
    // and the way on is the next riddle not yet done: here the other two are solved and seen
    expect(await screen.findByText(/every riddle here done/)).toBeInTheDocument();
  });

  it('says what a solve pays, and that a hint halves it', async () => {
    server();
    pages('/app/learn/riddles/kmr-sih');
    expect(await screen.findByText('A right guess pays up to 3 XP — 2 after a hint.')).toBeInTheDocument();
  });

  it('shows the answer only after asking once, on its own page', async () => {
    const { calls } = server();
    pages('/app/learn/riddles/kmr-sih');
    await userEvent.click(await screen.findByRole('button', { name: 'Show the answer' }));
    const ask = screen.getByRole('group', { name: /Show the answer\?/ });
    expect(ask).toHaveTextContent('solving this riddle earns no XP');
    expect(asked(calls, /\/reveal$/)).toEqual([]);
    expect(markup()).not.toContain('ANSWERWORD');
    await userEvent.click(within(ask).getByRole('button', { name: 'Show the answer' }));
    expect(await screen.findByText(SECRET.answer)).toBeInTheDocument();
    expect(screen.queryByText('You got it.')).toBeNull();
    expect(asked(calls, /\/reveal$/)).toHaveLength(1);
  });

  it('changing one’s mind keeps the riddle as it was', async () => {
    const { calls } = server();
    pages('/app/learn/riddles/kmr-sih');
    await userEvent.click(await screen.findByRole('button', { name: 'Show the answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep thinking' }));
    expect(screen.getByRole('button', { name: 'Show the answer' })).toBeInTheDocument();
    expect(asked(calls, /\/reveal$/)).toEqual([]);
  });

  it('the answer’s address, reached without asking, asks first', async () => {
    const { calls } = server();
    pages('/app/learn/riddles/kmr-sih/answer');
    expect(await screen.findByRole('heading', { level: 1, name: /Show the answer\?/ })).toBeInTheDocument();
    expect(asked(calls, /\/reveal$/)).toEqual([]);
    expect(markup()).not.toContain('ANSWERWORD');
    await userEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    expect(await screen.findByText(SECRET.answer)).toBeInTheDocument();
  });

  it('a riddle already solved goes to its answer without asking', async () => {
    server({ detail: { state: 'solved' } });
    pages('/app/learn/riddles/kmr-sih');
    expect(await screen.findByText('You solved this riddle.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your answer')).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'See the answer' }));
    expect(await screen.findByText(SECRET.answer)).toBeInTheDocument();
    expect(screen.getByText('You solved this one before.')).toBeInTheDocument();
  });

  it('challenges a friend with the question and the riddle’s address, never the answer', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    server();
    pages('/app/learn/riddles/kmr-sih');
    await userEvent.click(await screen.findByRole('button', { name: 'Challenge a friend' }));
    expect(share).toHaveBeenCalledTimes(1);
    const sent = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(sent.url).toBe(`${window.location.origin}/app/learn/riddles/kmr-sih`);
    expect(sent.text).toContain(riddleCard().question);
    expect(JSON.stringify(sent)).not.toMatch(/HINTWORD|ANSWERWORD|EXPLAINWORD/);
  });

  it('a visitor plays: the tab keeps their hints, and the server is asked again for each one', async () => {
    const { calls } = server({ signedIn: false });
    const first = pages('/app/learn/riddles/kmr-sih');
    await userEvent.click(await screen.findByRole('button', { name: 'Show a hint' }));
    expect(await screen.findByText(`${SECRET.hint} 1`)).toBeInTheDocument();
    // come straight here, they are told once what an account would keep
    expect(screen.getByText(/Playing is free/)).toBeInTheDocument();
    first.unmount();
    pages('/app/learn/riddles/kmr-sih');
    expect(await screen.findByText(`${SECRET.hint} 1`)).toBeInTheDocument();
    expect(asked(calls, /\/hint$/).map((c) => c.body)).toEqual([{ index: 0 }, { index: 0 }]);
    // a visitor is not told what a solve would pay
    expect(screen.queryByText(/pays up to/)).toBeNull();
  });
});
