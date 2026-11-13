import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ExerciseTools } from './practiceTools';
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
      // 'never': the answer does not arrive while the test looks
      if (games === 'never') return new Promise<Response>(() => undefined);
      return jsonResponse(200, {
        dialect: 'kmr',
        games: Object.entries(games).map(([id, available]) => ({ id, available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 20 })),
      });
    }
    if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
    // the Learn page reads its courses too: none here, which it draws as an empty list
    if (url.endsWith('/courses')) return jsonResponse(200, { courses: [] });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const asked = (fetchMock: Fetch): number => fetchMock.mock.calls.filter(([u]) => String(u).includes('/games/availability')).length;

describe('the lessons’ two exercises among the practice tools', () => {
  it('offers both where the learner’s Kurdish has enough for them, each at its page under Learn', async () => {
    server({ 'build-sentence': true, 'hear-it': true, 'memory-thief': true });
    renderApp(<ExerciseTools />);
    expect(await screen.findByRole('link', { name: /^Build a Sentence/ })).toHaveAttribute('href', '/app/learn/practice/build-sentence');
    expect(screen.getByRole('link', { name: /^Hear It, Find It/ })).toHaveAttribute('href', '/app/learn/practice/hear-it');
    // each says in a line what it is, as the other tools do
    expect(screen.getByText('Put a sentence’s words in order')).toBeInTheDocument();
    expect(screen.getByText('Listen and find what was said')).toBeInTheDocument();
    // a game the same answer names is not a practice tool
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows only the one that can be done, and nothing in place of the other', async () => {
    server({ 'build-sentence': false, 'hear-it': true });
    renderApp(<ExerciseTools />);
    expect(await screen.findByRole('link', { name: /^Hear It, Find It/ })).toBeInTheDocument();
    expect(screen.queryByText('Build a Sentence')).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('draws nothing until the answer has arrived', async () => {
    const fetchMock = server('never');
    const { container } = renderApp(<ExerciseTools />);
    await waitFor(() => expect(asked(fetchMock)).toBe(1));
    expect(container.querySelector('.learn-tool')).toBeNull();
  });
});

describe('Learn’s practice tools', () => {
  it('has the two exercises after the dictionary for somebody signed in', async () => {
    server({ 'build-sentence': true, 'hear-it': true });
    renderApp(<Learn />, ['/app/learn']);
    const sentence = await screen.findByRole('link', { name: /^Build a Sentence/ });
    const tools = sentence.closest('.learn-tools')!;
    const titles = [...tools.querySelectorAll('.learn-tool-title')].map((el) => el.textContent);
    expect(titles.slice(-3)).toEqual(['Dictionary', 'Build a Sentence', 'Hear It, Find It']);
  });

  it('shows a visitor neither, and does not ask the server about them', async () => {
    const fetchMock = server({ 'build-sentence': true, 'hear-it': true }, false);
    renderApp(<Learn />, ['/app/learn']);
    // the tools a visitor has are there
    expect(await screen.findByRole('link', { name: /Dictionary/ })).toBeInTheDocument();
    expect(screen.queryByText('Build a Sentence')).toBeNull();
    expect(screen.queryByText('Hear It, Find It')).toBeNull();
    expect(asked(fetchMock)).toBe(0);
  });
});
