import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Race } from './Race';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const TARGET = 'ez ji welatê xwe hez dikim';

const started = {
  id: 'r1',
  text: { id: 't1', title: 'Welat', body: TARGET, difficulty: 1 },
  startedAt: new Date().toISOString(),
};

/** Answers /race with a started game and /finish with whatever result is passed. */
function stub(result?: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/race/r1/finish')) {
      return jsonResponse(200, {
        wpm: 42.5, accuracy: 1, score: 42, correctChars: TARGET.length,
        perfect: true, elapsedMs: 30_000, xpAwarded: 15, ...result,
      });
    }
    if (String(url).includes('/race')) return jsonResponse(200, started);
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Start a race and hand back the field that takes the keystrokes. */
async function begin(user: ReturnType<typeof userEvent.setup>): Promise<HTMLTextAreaElement> {
  renderApp(<Race />, ['/app/games/race']);
  await user.click(screen.getByRole('button', { name: /start race/i }));
  return (await screen.findByLabelText('Type the text')) as HTMLTextAreaElement;
}

describe('Typing Race', () => {
  /**
   * The text and the box are one surface. Two boxes meant the text sat on the
   * page as ordinary prose beside an input — select it, copy it, paste it, and
   * the race is over in two keystrokes.
   */
  it('has one place to type, and it is the text itself', async () => {
    stub();
    const user = userEvent.setup();
    const input = await begin(user);

    // the old second box is gone
    expect(screen.queryByLabelText('Your typing')).not.toBeInTheDocument();
    // and the field sits inside the same box as the text it describes
    expect(input.closest('.race-type')).not.toBeNull();
    expect(input.closest('.race-type')?.querySelector('.race-text')?.textContent).toBe(TARGET);
    // the text is what the field is described by, so it is still announced
    expect(input).toHaveAttribute('aria-describedby', 'race-target');
  });

  it('refuses a paste, and says why rather than doing nothing', async () => {
    stub();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.click(input);
    await user.paste(TARGET);

    expect(input).toHaveValue('');
    expect(await screen.findByText(/no pasting/i)).toBeInTheDocument();
  });

  /**
   * A phone keyboard that finishes words for you is a paste with extra steps —
   * and on Kurdish text it also rewrites what you did type.
   */
  it('turns off the keyboard features that type for you', async () => {
    stub();
    const user = userEvent.setup();
    const input = await begin(user);

    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('marks each character right or wrong as it is typed', async () => {
    stub();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.click(input);
    await user.keyboard('ez x');

    const chars = document.querySelectorAll('.race-char');
    expect(chars[0]).toHaveClass('race-ok'); // e
    expect(chars[1]).toHaveClass('race-ok'); // z
    expect(chars[2]).toHaveClass('race-ok'); // space
    expect(chars[3]).toHaveClass('race-bad'); // 'j' typed as 'x'
    // and the caret sits on the next one along
    expect(chars[4]).toHaveClass('race-cursor');
  });

  it('will not accept more characters than the text has', async () => {
    stub();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.click(input);
    await user.keyboard('x'.repeat(TARGET.length + 10));

    expect((input.value ?? '').length).toBeLessThanOrEqual(TARGET.length);
  });

  /**
   * The client-side refusal is a courtesy; this is the rule that holds. Anyone
   * can post to the finish endpoint, so the server scores a superhuman speed at
   * nothing — and the page has to say so, or a run just reads as a broken zero.
   */
  it('says plainly when the server would not score the run', async () => {
    stub({ implausible: true, score: 0, xpAwarded: 0, perfect: false, wpm: 1240.5, elapsedMs: 600 });
    const user = userEvent.setup();
    const input = await begin(user);

    await user.click(input);
    await user.keyboard(TARGET);

    expect(await screen.findByText('Not scored')).toBeInTheDocument();
    expect(screen.getByText(/faster than anyone types/i)).toBeInTheDocument();
  });

  it('celebrates an ordinary finished run as before', async () => {
    stub();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.click(input);
    await user.keyboard(TARGET);

    expect(await screen.findByText('Perfect run!')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('42.5')).toBeInTheDocument());
    expect(screen.queryByText(/faster than anyone types/i)).not.toBeInTheDocument();
  });
});
