import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PlayGame } from '@kurda/shared';
import { fakeApi } from '../stories/testing';
import { FALLBACK_POLL_MS, useLobbyUpdates } from './usePlay';
import { renderPlay, signedInAndListening } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  hidden(false);
});

/** Whether the tab is hidden, as the page sees it. */
function hidden(on: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'hidden' : 'visible') });
}

function Probe({ read, live = true, game = 'wordle-battle' }: { read: () => void; live?: boolean; game?: PlayGame }): null {
  useLobbyUpdates(game, 'b1', read, live);
  return null;
}

const noInvites = { 'GET /play/invites': { incoming: [], outgoing: [] } };

describe('useLobbyUpdates', () => {
  it('reads again when the server says this lobby changed, and only this one', async () => {
    const { calls } = fakeApi(noInvites);
    const read = vi.fn();
    const { realtime } = renderPlay(<Probe read={read} />);
    await signedInAndListening(calls);

    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'other' });
    realtime.emit({ type: 'play_changed', game: 'rhyme-match', lobbyId: 'b1' });
    expect(read).not.toHaveBeenCalled();
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'b1' });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads every 10 s as a safety net — not every 1.5 s — and not while the tab is hidden', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fakeApi(noInvites);
    const read = vi.fn();
    renderPlay(<Probe read={read} />);

    expect(FALLBACK_POLL_MS).toBe(10_000);
    vi.advanceTimersByTime(9_999);
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(read).toHaveBeenCalledTimes(1);

    hidden(true);
    vi.advanceTimersByTime(60_000);
    expect(read).toHaveBeenCalledTimes(1);

    // coming back reads at once: it may have missed something while hidden
    hidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('stops reading once the game is over', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fakeApi(noInvites);
    const read = vi.fn();
    renderPlay(<Probe read={read} live={false} />);
    vi.advanceTimersByTime(60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(read).not.toHaveBeenCalled();
  });
});
