// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
// the lesson's end may offer reminders (push/ReminderOffer.tsx)
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), addListener: () => () => undefined, isFocused: () => true }),
  useFocusEffect: (run: () => void | (() => void)) => {
    // a screen in front: its focus effect runs once, as it would on arrival
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => run(), [run]);
  },
}));
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Providers, renderWithProviders } from '../reports/testing/harness';
import { useCelebration } from '../theme/CelebrationParts';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, refreshFelt, resetHaptics } from './haptics';
import { onSound, resetSounds } from './sounds';
import { Platform } from 'react-native';
import type { HapticEvent } from './hapticPacing';
import { Segmented } from '../theme/glass';
import { Chips } from '../theme/Chips';
import { Toggle } from '../theme/Toggle';
import { Celebration } from '../ranks/Celebration';
import { LessonResults } from '../lesson/components/LessonResults';
import { SessionPlayer } from '../lesson/LessonPlayerScreen';
import { FeedCard } from '../feed/FeedCard';
import { ChatScreen } from '../chat/ChatScreen';
import type { SessionResults, SessionView } from '../lesson/types';
import type { FeedItem } from '../feed/types';

patchReactNativeWeb();

/*
 * Which buzz each moment is felt as, and that the moments that are not worth
 * one stay still. The pacing rules themselves are tested in shared haptics.ts;
 * here the question is only "did the right event fire, at the right moment".
 */
let felt: HapticEvent[] = [];
let stop: () => void = () => undefined;
beforeEach(() => {
  resetHaptics();
  felt = [];
  stop = onHaptic((e) => felt.push(e));
});
afterEach(() => {
  stop();
  cleanup();
  vi.useRealTimers();
});

describe('a choice changing is a tick', () => {
  function Picker(): React.JSX.Element {
    const [v, setV] = useState<'a' | 'b'>('a');
    return (
      <>
        <Segmented options={['a', 'b'] as const} value={v} onChange={setV} labelOf={(x) => `seg ${x}`} />
        <Chips options={['a', 'b'] as const} value={v} onChange={setV} labelOf={(x) => `chip ${x}`} />
      </>
    );
  }

  it('on a segmented control and a chip — and nothing for tapping the one already chosen', () => {
    renderWithProviders(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: 'seg a' }));
    expect(felt).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'seg b' }));
    expect(felt).toEqual(['select']);
    resetHaptics();
    fireEvent.click(screen.getByRole('button', { name: 'chip a' }));
    expect(felt).toEqual(['select', 'select']);
  });

  it('on a switch', () => {
    const onValueChange = vi.fn();
    renderWithProviders(<Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Event themes" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Event themes' }));
    expect(felt).toEqual(['select']);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});

describe('a pull to refresh', () => {
  /** Pretend to be `os` for the length of `run`. */
  function as(os: string, run: () => void): void {
    const was = Platform.OS;
    (Platform as { OS: string }).OS = os;
    try {
      run();
    } finally {
      (Platform as { OS: string }).OS = was;
    }
  }

  it('is felt once: our tick where the system gives none, and nothing on top of iOS’s own', () => {
    const refresh = vi.fn();
    as('android', () => refreshFelt(refresh)());
    expect(felt).toEqual(['tap']);
    resetHaptics();
    as('ios', () => refreshFelt(refresh)());
    expect(felt).toEqual(['tap']);
    // and the list reloads either way
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('a celebration is felt once, as the art lands', () => {
  const moment = (onClose = vi.fn()) => (
    <Celebration
      art={null}
      glow="#ffcc00"
      flecks={14}
      fleckColours={['#fff']}
      seed={1}
      kicker="NEW TIER"
      title="Gir"
      announce="New tier: Gir"
      onClose={onClose}
      actions={null}
    />
  );

  it('a moment after it opens, and never again', () => {
    vi.useFakeTimers();
    renderWithProviders(moment());
    expect(felt).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(felt).toEqual(['celebrate']);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(felt).toEqual(['celebrate']);
  });

  it('or at the tap that skips it, before it has landed — once', () => {
    vi.useFakeTimers();
    // the stage's own skip (a Pressable over the art) calls this; tests run React Native's
    // animations as instant, so the moment is skipped through the hook itself
    const { result } = renderHook(() => useCelebration(), { wrapper: Providers });
    act(() => result.current.skip());
    expect(felt).toEqual(['celebrate']);
    expect(result.current.playing).toBe(false);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(felt).toEqual(['celebrate']);
  });
});

const results = (over: Partial<SessionResults> = {}): SessionResults => ({
  correct: 3,
  total: 4,
  accuracy: 0.75,
  mistakes: [],
  xpAwarded: 15,
  streak: { current: 7, longest: 9, freezes: 0, lastActiveOn: '2026-10-20' },
  ...over,
});

describe('the end of a lesson', () => {
  it('is one buzz however much it did: finished, today’s goal, the streak and a new level', async () => {
    vi.useFakeTimers();
    renderWithProviders(
      <LessonResults results={results()} exercises={[]} moments={{ goalMet: true, streakKept: true, level: 5 }} onDone={() => undefined} />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(felt).toEqual(['celebrate']);
    expect(screen.getByText('Daily goal reached. Nice work!')).toBeTruthy();
    expect(screen.getByText('You reached level 5')).toBeTruthy();
  });
});

describe('an answer, as its verdict arrives', () => {
  const view: SessionView = {
    sessionId: 's1',
    lessonId: 'l1',
    expiresAt: '2999-01-01T00:00:00Z',
    completed: false,
    answered: {},
    exercises: [
      { id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'], position: 1 },
      { id: 'mc2', type: 'multiple_choice', prompt: 'Bread?', options: ['av', 'nan'], position: 2 },
    ],
  };
  const paths = { answers: () => '/sessions/s1/answers', retry: () => '/sessions/s1/retry', complete: () => '/sessions/s1/complete' };

  it('is crisp when right and a gentle double when not — never the error buzz', async () => {
    resetSounds();
    const heard: string[] = [];
    const stopHearing = onSound((f) => heard.push(f));
    testAuth.client = fakeClient({
      'GET /me': ok({ user: { skipSpeaking: false } }),
      'GET /me/daily-goal': ok({ completed: false }),
      'POST /sessions/s1/answers': (body) =>
        (body as { exerciseId: string }).exerciseId === 'mc'
          ? ok({ verdict: 'correct', accepted: true, duplicate: false })
          : ok({ verdict: 'wrong', accepted: false, correction: 'nan', duplicate: false }),
    });
    renderWithProviders(<SessionPlayer view={view} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(felt).toEqual(['correct']));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(felt).toEqual(['correct', 'wrong']));
    // and heard: a bright pair for the right answer, a low soft one for the miss
    expect(heard).toEqual(['correct-1', 'wrong']);
    stopHearing();
    // and the right answer is marked where it was asked
    expect(screen.getByRole('radio', { name: 'nan, Correct' })).toBeTruthy();
  });
});

describe('something given', () => {
  const item: FeedItem = {
    key: 'library:p1',
    id: 'p1',
    targetType: 'library',
    kind: 'poem',
    title: 'Şev',
    excerpt: 'Şev e…',
    at: '2026-10-19T10:00:00Z',
    author: { id: 'u2', username: 'azad', displayName: null, avatarUrl: null },
    commentCount: 0,
    engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: false },
  } as unknown as FeedItem;

  it('a like is a light tap; taking it back is quiet', async () => {
    testAuth.client = fakeClient({ 'POST /posts/library/p1/like': ok({ on: true, engagement: { ...item.engagement, liked: true, likes: 1 } }) });
    const { rerender } = renderWithProviders(<FeedCard item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(felt).toEqual(['tap']);
    // the heart fills at once, before the server has answered
    await waitFor(() => expect(screen.getByRole('button', { name: /Unlike/ })).toBeTruthy());
    resetHaptics();
    rerender(<FeedCard item={{ ...item, engagement: { ...item.engagement, liked: true, likes: 1 } }} />);
    fireEvent.click(screen.getByRole('button', { name: /Unlike/ }));
    expect(felt).toEqual(['tap']);
  });

  it('a message sent is a tap; one the server refuses is felt as an error too', async () => {
    let refuse = false;
    testAuth.client = fakeClient({
      'GET /chat/u-azad/messages': ok({ messages: [] }),
      'POST /chat/u-azad/read': ok({ ok: true }),
      'POST /chat/u-azad/typing': ok({ ok: true }),
      'POST /chat/u-azad/messages': (body) =>
        refuse
          ? fail({ code: 'CHAT_MUTED', message: 'muted' })
          : ok({ id: 'm1', senderId: 'me', recipientId: 'u-azad', body: (body as { body: string }).body, createdAt: '2026-10-20T10:00:00Z', readAt: null }),
    });
    renderWithProviders(<ChatScreen userId="u-azad" username="Azad" onExit={() => undefined} />);
    const field = await screen.findByLabelText('Message…');
    fireEvent.change(field, { target: { value: 'Silav' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(felt).toEqual(['tap']));

    refuse = true;
    resetHaptics();
    fireEvent.change(field, { target: { value: 'Silav dîsa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(felt).toEqual(['tap', 'tap', 'error']));
  });
});
