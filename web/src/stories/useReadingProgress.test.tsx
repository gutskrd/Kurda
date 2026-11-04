import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { StoryMe } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { fakeApi, type Call } from './testing';
import { PROGRESS_EVERY_MS, useReadingProgress } from './useReadingProgress';

/**
 * A browser's observer, stood in for: the test says which paragraph came
 * into view by calling what the hook handed over.
 */
let seen: IntersectionObserverCallback | null = null;
const observed: Element[] = [];
class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    seen = cb;
  }
  observe(el: Element): void {
    observed.push(el);
  }
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  seen = null;
  observed.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const me = (over: Partial<StoryMe> = {}): StoryMe => ({ bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0, ...over });

function Reading({ count, initial, onMe }: { count: number; initial: StoryMe | null; onMe: (m: StoryMe) => void }): React.JSX.Element {
  const { observe } = useReadingProgress({ storyId: 'st-1', count, enabled: true, initial, onMe });
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <p key={i} ref={observe(i)} data-paragraph={i}>
          paragraph {i}
        </p>
      ))}
    </div>
  );
}

/** The paragraph at `index` comes into view. */
const show = (index: number): void =>
  act(() => {
    seen!([{ isIntersecting: true, target: observed[index]! } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
  });

const puts = (calls: Call[]) => calls.filter((c) => c.method === 'PUT' && c.path === '/stories/st-1/progress').map((c) => c.body);

describe('keeping a reader’s place', () => {
  it('writes at once, then at most every ten seconds, the furthest paragraph seen', async () => {
    const told: StoryMe[] = [];
    const { calls } = fakeApi({ 'PUT /stories/st-1/progress': (c: Call) => ({ me: me({ paragraph: (c.body as { paragraph: number }).paragraph }) }) });
    render(
      <AuthProvider>
        <Reading count={5} initial={null} onMe={(m) => told.push(m)} />
      </AuthProvider>,
    );
    expect(observed).toHaveLength(5);
    show(1);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(puts(calls)).toEqual([{ paragraph: 1, share: 0.4 }]);
    // more paragraphs inside the ten seconds: nothing yet
    show(2);
    show(3);
    show(2);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(puts(calls)).toHaveLength(1);
    // the slot comes: one write, with the furthest
    await act(() => vi.advanceTimersByTimeAsync(PROGRESS_EVERY_MS - 5_000));
    expect(puts(calls)).toEqual([
      { paragraph: 1, share: 0.4 },
      { paragraph: 3, share: 0.8 },
    ]);
    // the server's answer is handed back each time
    expect(told.map((m) => m.paragraph)).toEqual([1, 3]);
  });

  it('says finished at once when the last paragraph is seen, and never goes back behind the place it arrived with', async () => {
    const { calls } = fakeApi({ 'PUT /stories/st-1/progress': { me: me({ paragraph: 4, finishedAt: '2026-11-04T10:00:00Z' }) } });
    render(
      <AuthProvider>
        <Reading count={5} initial={me({ paragraph: 3, share: 0.8 })} onMe={() => undefined} />
      </AuthProvider>,
    );
    // paragraphs before the remembered one change nothing
    show(1);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(puts(calls)).toEqual([]);
    show(4);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(puts(calls)).toEqual([{ paragraph: 4, share: 1, finished: true }]);
  });

  it('sends what is unsent when the page is hidden, and when the reader leaves', async () => {
    const { calls } = fakeApi({ 'PUT /stories/st-1/progress': { me: me({ paragraph: 2 }) } });
    const view = render(
      <AuthProvider>
        <Reading count={5} initial={null} onMe={() => undefined} />
      </AuthProvider>,
    );
    show(0);
    await act(() => vi.advanceTimersByTimeAsync(0));
    show(2);
    expect(puts(calls)).toHaveLength(1);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(puts(calls).at(-1)).toEqual({ paragraph: 2, share: 0.6 });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    show(3);
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(puts(calls).at(-1)).toEqual({ paragraph: 3, share: 0.8 });
  });
});
