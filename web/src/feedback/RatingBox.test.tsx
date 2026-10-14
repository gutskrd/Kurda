import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, jsonResponse } from '../test/utils';
import { RatingBox } from './RatingBox';
import { webVersion } from './api';

type Call = { url: string; body: unknown };

function stub(answer: { status: number; body: unknown } = { status: 201, body: { id: 'f1' } }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).includes('/me/app-feedback')) return jsonResponse(answer.status, answer.body);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

const posts = (calls: Call[], path: string): unknown[] => calls.filter((c) => c.url.endsWith(path)).map((c) => c.body);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the rating box', () => {
  it('asks with five labelled stars, and the deer holds them up', async () => {
    stub();
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={() => undefined} />);

    const group = screen.getByRole('radiogroup', { name: 'How are you enjoying Hevalo?' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    // nothing to send before a star is chosen
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked();
    expect(document.querySelector('.deer')).toHaveAttribute('data-stars', '4');
  });

  it('under three stars, asks what could be better, and sends the stars, chips and words', async () => {
    const calls = stub();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={onClose} />);

    await user.click(screen.getByRole('radio', { name: '2 stars' }));
    expect(screen.getByText('Thanks for telling us — what could be better?')).toBeInTheDocument();
    // the question is asked once: the box under it is only "tell us more"
    expect(screen.queryByLabelText('What could be better?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Games' }));
    await user.click(screen.getByRole('checkbox', { name: 'Too hard' }));
    await user.type(screen.getByLabelText('Tell us more (optional)'), '  The race is too fast  ');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('heading', { name: 'Thank you — we read every message.' })).toHaveFocus();
    expect(posts(calls, '/me/app-feedback')).toEqual([
      {
        stars: 2,
        categories: ['games', 'too_hard'],
        comment: 'The race is too fast',
        source: 'first_game',
        locale: 'en',
        platform: 'web',
        appVersion: 'web',
      },
    ]);
    // the thank-you is a happy deer, whatever the stars were
    expect(Number(document.querySelector('.deer')!.getAttribute('data-stars'))).toBeGreaterThanOrEqual(4);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledWith('answered');
  });

  it('from three stars, says thank you, asks what they love — and links to no store', async () => {
    const calls = stub();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={onClose} />);

    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    expect(screen.getByText('Thank you! 💛')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // with nothing typed, "Done" is the only button: it sends the stars and
    // closes, with no "we read every message" for a message never written
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith('answered'));
    expect(screen.queryByText('Thank you — we read every message.')).not.toBeInTheDocument();
    expect(posts(calls, '/me/app-feedback')).toEqual([
      { stars: 5, source: 'first_game', locale: 'en', platform: 'web', appVersion: 'web' },
    ]);
  });

  it('thanks for words about what they love once they are sent', async () => {
    const calls = stub();
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={() => undefined} />);

    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    await user.type(screen.getByLabelText('What do you love?'), 'The deer');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('heading', { name: 'Thank you — we read every message.' })).toHaveFocus();
    expect(posts(calls, '/me/app-feedback')).toEqual([
      { stars: 4, comment: 'The deer', source: 'first_game', locale: 'en', platform: 'web', appVersion: 'web' },
    ]);
  });

  /** shown is already counted by the box that shows it (FeedbackHost) */
  it('“Not now”, before any star, only closes it', async () => {
    const calls = stub();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onClose).toHaveBeenCalledWith('dismissed');
    expect(calls.filter((c) => c.url.includes('/me/app-feedback'))).toEqual([]);
  });

  it('once stars are chosen, the way out is “Close”, and it keeps the stars — not the words', async () => {
    const calls = stub();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={onClose} />);

    await user.click(screen.getByRole('radio', { name: '2 stars' }));
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tell us more (optional)'), 'never mind');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledWith('answered');
    await waitFor(() =>
      expect(posts(calls, '/me/app-feedback')).toEqual([
        { stars: 2, source: 'first_game', locale: 'en', platform: 'web', appVersion: 'web' },
      ]),
    );
  });

  it('leaving after Send does not send the answer twice', async () => {
    const calls = stub();
    const leave: { current: (() => void) | null } = { current: null };
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={() => undefined} leaveRef={leave} />);

    await user.click(screen.getByRole('radio', { name: '1 star' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Thank you — we read every message.');
    act(() => leave.current?.());

    expect(posts(calls, '/me/app-feedback')).toHaveLength(1);
  });

  it('says what went wrong and keeps what was written', async () => {
    stub({ status: 429, body: { code: 'RATE_LIMITED', message: 'slow down' } });
    const user = userEvent.setup();
    renderApp(<RatingBox source="first_game" onClose={() => undefined} />);

    await user.click(screen.getByRole('radio', { name: '1 star' }));
    await user.type(screen.getByLabelText('Tell us more (optional)'), 'Bugs everywhere');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Tell us more (optional)')).toHaveValue('Bugs everywhere');
  });

  it('from Settings, takes words alone, without stars, and never offers “Not now”', async () => {
    const calls = stub();
    const user = userEvent.setup();
    renderApp(<RatingBox source="settings" onClose={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Send feedback' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Stories' }));
    await user.type(screen.getByLabelText('What could be better?'), 'More stories please');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Thank you — we read every message.');
    expect(posts(calls, '/me/app-feedback')).toEqual([
      { categories: ['stories'], comment: 'More stories please', source: 'settings', locale: 'en', platform: 'web', appVersion: 'web' },
    ]);
  });
});

describe('the version the web sends', () => {
  it('is "web", or "web-" and the build when the build names one', () => {
    expect(webVersion(undefined)).toBe('web');
    expect(webVersion('  ')).toBe('web');
    expect(webVersion('2026.10.14')).toBe('web-2026.10.14');
    expect(webVersion('a b/c<script>')).toBe('web-abcscript');
  });
});
