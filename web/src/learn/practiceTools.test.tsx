import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLessonExercises } from './practiceTools';
import { Learn } from '../pages/Learn';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Fetch = ReturnType<typeof vi.fn>;

/** What the server says can be done in Kurmancî, by id; `signedIn` puts a session in the browser first. */
function server(games: Record<string, boolean> | 'never', signedIn = true): Fetch {
  if (signedIn) localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/games/availability')) {
      // 'never': the answer does not arrive while the test looks.
      if (games === 'never') return new Promise<Response>(() => undefined);
      return jsonResponse(200, {
        dialect: 'kmr',
        games: Object.entries(games).map(([id, available]) => ({ id, available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 20 })),
      });
    }
    if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
    // The Learn page reads its courses too: none here, which it draws as an empty list.
    if (url.endsWith('/courses')) return jsonResponse(200, { courses: [] });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const asked = (fetchMock: Fetch): number => fetchMock.mock.calls.filter(([u]) => String(u).includes('/games/availability')).length;

/** The hook's answer as plain links, the way the practice hub lists them. */
function Offered(): React.JSX.Element {
  const offered = useLessonExercises();
  return (
    <ul>
      {offered.map(({ id, web }) => (
        <li key={id}>
          <a href={web.href}>{id}</a>
        </li>
      ))}
    </ul>
  );
}

describe('the lessons’ two exercises', () => {
  it('are offered where the learner’s Kurdish has enough for them, each at its page under Learn', async () => {
    server({ 'build-sentence': true, 'hear-it': true, 'memory-thief': true });
    renderApp(<Offered />);
    expect(await screen.findByRole('link', { name: 'build-sentence' })).toHaveAttribute('href', '/app/learn/practice/build-sentence');
    expect(screen.getByRole('link', { name: 'hear-it' })).toHaveAttribute('href', '/app/learn/practice/hear-it');
    // A game the same answer names is not a lesson exercise.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('leave out the one that cannot be done, with nothing in its place', async () => {
    server({ 'build-sentence': false, 'hear-it': true });
    renderApp(<Offered />);
    expect(await screen.findByRole('link', { name: 'hear-it' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('are none until the answer has arrived', async () => {
    const fetchMock = server('never');
    renderApp(<Offered />);
    await waitFor(() => expect(asked(fetchMock)).toBe(1));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

/* The lessons are the road: the exercises live in the lessons themselves and in practice, never as tiles on Learn. */
describe('Learn', () => {
  it('offers no exercise tiles to anyone, and does not ask the server about them', async () => {
    for (const signedIn of [true, false]) {
      const fetchMock = server({ 'build-sentence': true, 'hear-it': true }, signedIn);
      const { unmount } = renderApp(<Learn />, ['/app/learn']);
      expect(await screen.findByRole('link', { name: 'Dictionary' })).toBeInTheDocument();
      expect(screen.queryByText('Build a Sentence')).toBeNull();
      expect(screen.queryByText('Hear It, Find It')).toBeNull();
      expect(asked(fetchMock)).toBe(0);
      unmount();
      localStorage.clear();
    }
  });
});
