import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { jsonResponse, renderApp } from '../test/utils';
import { JumpTest } from './JumpTest';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

let calls: Call[] = [];

function serve(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      calls.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const reply = routes[`${method} ${path}`];
      if (reply instanceof Response) return reply;
      return reply === undefined ? jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' }) : jsonResponse(200, reply);
    }),
  );
}

function Where(): React.JSX.Element {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function show(): void {
  renderApp(
    <>
      <Routes>
        <Route path="/app/learn/jump/:courseId/:unitId" element={<JumpTest />} />
        <Route path="/app/learn/course/:courseId" element={<p>the path</p>} />
      </Routes>
      <Where />
    </>,
    [{ pathname: '/app/learn/jump/c1/r3', state: { from: '/app/learn/course/c1' } }],
  );
}

const test = (answered: Record<string, unknown> = {}, triesLeft = 2) => ({
  sessionId: 'j1',
  exercises: [{ id: 'x', type: 'translate', prompt: 'house', dialect: 'kurmanji' }],
  answered,
  // Every item answered: the player goes straight to the end, as it does for a test reopened after its last answer.
  completed: Object.keys(answered).length > 0,
  jump: { unitId: 'r3', unitNumber: 3, unitTitle: 'House', mistakesAllowed: 0, triesLeft },
});

const outcome = (passed: boolean) => ({
  correct: passed ? 1 : 0,
  total: 1,
  accuracy: passed ? 1 : 0,
  xpAwarded: 0,
  streak: { current: 1, longest: 1 },
  jump: { unitId: 'r3', passed, correct: passed ? 1 : 0, total: 1, mistakesAllowed: 0 },
});

beforeEach(() => {
  calls = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a jump-ahead test', () => {
  it('starts the test for its chapter and plays it in the lesson player, with the way back to the path', async () => {
    serve({ 'POST /courses/c1/jump': test() });
    show();
    expect(await screen.findByText('house')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/courses/c1/jump')).toEqual([{ method: 'POST', path: '/courses/c1/jump', body: { unitId: 'r3' } }]);
    expect(screen.getByRole('link', { name: 'Leave for now — your answers are saved' })).toHaveAttribute('href', '/app/learn/course/c1');
  });

  it('ends on the chapter opened, and goes to it', async () => {
    serve({ 'POST /courses/c1/jump': test({ x: { verdict: 'correct', accepted: true } }), 'POST /practice/sessions/j1/complete': outcome(true) });
    show();
    const heading = await screen.findByRole('heading', { name: 'Chapter 3 is open!' });
    // The heading takes focus once it is on screen, so it is read at once.
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText('1 of 1 right. The lessons you skipped stay open to come back to.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to Chapter 3' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/course/c1');
  });

  it('says a miss plainly, with the tries left today, and tries again at once', async () => {
    serve({ 'POST /courses/c1/jump': test({ x: { verdict: 'wrong', accepted: false } }), 'POST /practice/sessions/j1/complete': outcome(false) });
    show();
    expect(await screen.findByRole('heading', { name: 'Not yet' })).toBeInTheDocument();
    expect(screen.getByText('0 of 1 right. Chapter 3 opens with 1 right.')).toBeInTheDocument();
    expect(screen.getByText('Tries left today: 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(calls.filter((c) => c.path === '/courses/c1/jump')).toHaveLength(2));
  });

  it('says when today’s tries are used up, with the way back', async () => {
    serve({ 'POST /courses/c1/jump': jsonResponse(429, { code: 'JUMP_LIMIT', message: 'no more tests at this unit today' }) });
    show();
    expect(await screen.findByRole('heading', { name: 'No more tries today' })).toBeInTheDocument();
    expect(screen.getByText('Each chapter’s test can be tried 3 times a day. Keep learning, or try again tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Keep learning' })).toHaveAttribute('href', '/app/learn/course/c1');
  });
});
