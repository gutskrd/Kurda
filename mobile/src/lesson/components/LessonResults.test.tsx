// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The web build until a test says otherwise; only a phone has notifications to ask about.
const device = vi.hoisted(() => ({ os: 'web' }));
vi.mock('react-native', async () => {
  // react-native-web ships no types.
  const rn = (await import('react-native-web')) as unknown as Record<string, object> & { Platform: object };
  return {
    ...rn,
    Platform: {
      ...rn.Platform,
      get OS() {
        return device.os;
      },
    },
  };
});
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../../reports/testing/netinfo'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
// A badge earned meanwhile waits on the celebration (badges/BadgeCelebrationHost.tsx).
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Share } from 'react-native';
import { WORD_PICTURES, type QuestDay } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { notificationsStub } from '../../reports/testing/stubs';
import { deviceStore } from '../../keyboard/deviceStore';
import { OFFER_KEY } from '../../push/permission';
import { characterLayers } from '../../characters/layers';
import { sameIds } from '../../reports/testing/sameIds';
import { FakeAudio } from '../../characters/testing/audio';
import { NO_MOMENTS } from '../moments';
import type { SessionResults } from '../types';
import { LessonResults } from './LessonResults';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const results: SessionResults = {
  correct: 9,
  total: 11,
  accuracy: 0.82,
  mistakes: [],
  xpAwarded: 33,
  streak: { current: 6, longest: 9, freezes: 0, lastActiveOn: '2026-10-29', today: '2026-10-29', recent: [{ date: '2026-10-29', kind: 'learned' }] },
};

const show = (over: Partial<ComponentProps<typeof LessonResults>> = {}) =>
  renderWithProviders(<LessonResults results={results} exercises={[]} dialect="kmr" sitting={{ ms: 112_400, answers: 13 }} onDone={() => undefined} {...over} />);

describe('the results cards', () => {
  it('show the XP, the share right first time under its kind word, and how long the sitting took, each read as one card', async () => {
    show();
    expect(await screen.findByLabelText('XP earned: +33')).toBeTruthy();
    expect(screen.getByLabelText('Right first time: 82%, Solid, 9 of 11')).toBeTruthy();
    // Under ten seconds an answer counts as quick.
    expect(screen.getByLabelText('Quick: 1 min 52 s')).toBeTruthy();
    expect(await screen.findByText('33')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText('1:52')).toBeTruthy();
    expect(screen.getByText('Solid')).toBeTruthy();
  });

  it('write a short sitting as m:ss, and call a steady one simply Time', async () => {
    show({ sitting: { ms: 7_400, answers: 1 } });
    expect(await screen.findByLabelText('Time: 0 min 7 s')).toBeTruthy();
    expect(await screen.findByText('0:07')).toBeTruthy();
  });

  it('leave the time out when the sitting was not measured', async () => {
    show({ sitting: null });
    expect(await screen.findByLabelText('XP earned: +33')).toBeTruthy();
    expect(screen.queryByText('Time')).toBeNull();
    expect(screen.queryByText('Quick')).toBeNull();
  });

  it('are in their final numbers at once under Reduce Motion', async () => {
    show({ sitting: { ms: 600_000, answers: 20 } });
    expect(await screen.findByText('10:00')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
    expect(screen.queryByText('0:00')).toBeNull();
  });
});

describe('water for the tree', () => {
  it('says what the lesson earned the learner’s tree, and nothing where it earned none', async () => {
    show({ results: { ...results, tree: { gained: 1, water: 3 } } });
    expect(await screen.findByText('+1 water for your tree')).toBeTruthy();
    cleanup();
    // No tree, a replay, or a server without trees: the results say nothing about it.
    show();
    await screen.findByRole('button', { name: /Continue|Next lesson|Done|Back to the path/ });
    expect(screen.queryByTestId('lesson-water')).toBeNull();
  });
});

describe('the title', () => {
  it('says how it went, with a warm line about the course’s own Kurdish', async () => {
    show({ moments: { ...NO_MOMENTS, perfect: true }, results: { ...results, accuracy: 1, correct: 11 } });
    expect(await screen.findByRole('heading', { name: 'Perfect lesson!' })).toBeTruthy();
    expect(screen.getByText('Your Kurmancî is getting stronger')).toBeTruthy();
    cleanup();

    show({ dialect: 'ckb' });
    expect(await screen.findByRole('heading', { name: 'Great work!' })).toBeTruthy();
    expect(screen.getByText('Your Soranî is getting stronger')).toBeTruthy();
    cleanup();

    // Practice has no course of its own; a lesson that went badly is still a lesson done.
    show({ dialect: null, results: { ...results, accuracy: 0.5, correct: 5 } });
    expect(await screen.findByRole('heading', { name: 'Lesson complete!' })).toBeTruthy();
    expect(screen.getByText('Your Kurdish is getting stronger')).toBeTruthy();
  });
});

describe('Hevalo', () => {
  it('puts his head in at the window over the results, his head and neck and never the whole deer', async () => {
    show();
    expect(await screen.findByTestId('hevalo-window')).toBeTruthy();
    const drawn = [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
    expect(drawn).toContain(sameIds(characterLayers('hevalo', 'head')).body);
    expect(drawn).not.toContain(sameIds(characterLayers('hevalo', 'full')).body);
  });
});

describe('the way on', () => {
  const day: QuestDay = {
    date: '2026-10-29',
    monthDone: 2,
    waiting: [],
    quests: [
      { id: 'q:streak', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: false, claimed: true },
      { id: 'q:xp', kind: 'xp', target: 40, progress: 33, chest: 'rare', claimable: false, claimed: false },
      { id: 'q:lessons', kind: 'lessons', target: 2, progress: 1, chest: 'epic', claimable: false, claimed: false },
    ],
  };

  it('passes the streak’s moment and then today’s quests, once each, on the way to the next lesson', async () => {
    testAuth.client = fakeClient({ 'GET /me/quests': ok(day) });
    const onNext = vi.fn();
    show({
      moments: { ...NO_MOMENTS, streakKept: true },
      results: { ...results, quests: [{ id: 'q:xp', kind: 'xp', target: 40, chest: 'rare', from: 0, to: 33, claimable: false }] },
      next: { lessonId: 'l2', title: 'Malbat' },
      onNext,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Next lesson' }));

    // The streak on its card (the flame screen is for growth days, and day six is not one).
    expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
    expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Then the quests this lesson moved, and on.
    expect(await screen.findByRole('heading', { name: 'Daily quests' })).toBeTruthy();
    expect(await screen.findByLabelText('Earn 40 XP: 33 of 40')).toBeTruthy();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledWith('l2');
  });

  it('goes straight on when the lesson kept no streak and moved no quest', async () => {
    const onNext = vi.fn();
    show({ next: { lessonId: 'l2', title: 'Malbat' }, onNext });
    fireEvent.click(await screen.findByRole('button', { name: 'Next lesson' }));
    expect(onNext).toHaveBeenCalledWith('l2');
    expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
  });

  // The screen before the notification question is the last moment, with one button, never a card among the results.
  describe('by way of the phone’s question about notifications', () => {
    const TITLE = 'Notifications from Hevalo';
    /** Lets the results' requests settle: the phone's answer, the record, the account's age. */
    const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    beforeEach(async () => {
      device.os = 'ios';
      // The phone remembers the screen was shown and would not show it again that week.
      await deviceStore.remove(OFFER_KEY);
      notificationsStub.permission = { status: 'undetermined', granted: false, canAskAgain: true };
      notificationsStub.afterRequest = { status: 'granted', granted: true, canAskAgain: true };
      notificationsStub.requests = 0;
      notificationsStub.failRequest = false;
      notificationsStub.prompt = null;
      testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: false } }), 'GET /me/quests': ok(day) });
    });
    afterEach(() => {
      device.os = 'web';
      testAuth.client = fakeClient();
    });

    it('comes last, after the streak and the quests, and the way on is taken when the phone is answered no', async () => {
      notificationsStub.afterRequest = { status: 'denied', granted: false, canAskAgain: false };
      const onNext = vi.fn();
      show({
        offerReminders: true,
        moments: { ...NO_MOMENTS, streakKept: true },
        results: { ...results, quests: [{ id: 'q:xp', kind: 'xp', target: 40, chest: 'rare', from: 0, to: 33, claimable: false }] },
        next: { lessonId: 'l2', title: 'Malbat' },
        onNext,
      });
      // The results say nothing about it: no card, no "Allow", no "Not now" beside the ways on.
      const next = await screen.findByRole('button', { name: 'Next lesson' });
      await settle();
      expect(screen.queryByText(TITLE)).toBeNull();
      expect(screen.queryByRole('button', { name: /allow|not now/i })).toBeNull();

      fireEvent.click(next);
      expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByRole('heading', { name: 'Daily quests' })).toBeTruthy();
      expect(await screen.findByLabelText('Earn 40 XP: 33 of 40')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      // The screen before the phone's question: one button, and nothing asked until it is pressed.
      expect(await screen.findByRole('heading', { name: TITLE })).toBeTruthy();
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Continue']);
      expect(notificationsStub.requests).toBe(0);
      expect(onNext).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await settle();
      expect(notificationsStub.requests).toBe(1);
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(onNext).toHaveBeenCalledWith('l2');
    });

    it('is the one moment on the way when the lesson kept no streak and moved no quest, and goes on when the phone is answered yes', async () => {
      const onDone = vi.fn();
      show({ offerReminders: true, onDone });
      const done = await screen.findByRole('button', { name: 'Done' });
      await settle();
      fireEvent.click(done);
      expect(await screen.findByRole('heading', { name: TITLE })).toBeTruthy();
      expect(onDone).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await settle();
      expect(notificationsStub.requests).toBe(1);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('does not follow practice, nor a lesson on a phone that has already answered', async () => {
      const practice = vi.fn();
      show({ onDone: practice });
      const done = await screen.findByRole('button', { name: 'Done' });
      await settle();
      fireEvent.click(done);
      expect(practice).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(TITLE)).toBeNull();
      cleanup();

      notificationsStub.permission = { status: 'denied', granted: false, canAskAgain: false };
      const answered = vi.fn();
      show({ offerReminders: true, onDone: answered });
      const again = await screen.findByRole('button', { name: 'Done' });
      await settle();
      fireEvent.click(again);
      expect(answered).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(TITLE)).toBeNull();
      expect(notificationsStub.requests).toBe(0);
    });

    it('keeps nobody waiting to find out: a way on taken before the phone has said goes straight on', async () => {
      // The account's age is still loading.
      testAuth.client = fakeClient({ 'GET /me': () => new Promise(() => undefined) });
      const onDone = vi.fn();
      show({ offerReminders: true, onDone });
      fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(TITLE)).toBeNull();
    });
  });
});

describe('the mistakes', () => {
  // An answer is isolated from its line, so it keeps its own direction within text of the other direction.
  const isolated = (answer: string): string => `\u2068${answer}\u2069`;

  // The server names a picture by its catalogue id, which is not always what it shows ("ewe" is a sheep).
  it('name a missed picture by what it shows', async () => {
    const [id, picture] = Object.entries(WORD_PICTURES).find(([key, p]) => key !== p.en)!;
    show({
      results: { ...results, mistakes: [{ exerciseId: 'p1', verdict: 'wrong', prompt: picture.ku, correction: id }, { exerciseId: 'm1', verdict: 'wrong', prompt: 'Silav!', correction: 'Hello!' }] },
      exercises: [
        { id: 'p1', type: 'multiple_choice', ask: 'picture', prompt: picture.ku, options: [id, 'apple'] },
        { id: 'm1', type: 'multiple_choice', ask: 'meaning', prompt: 'Silav!', options: ['Hello!', 'No!'] },
      ],
    });
    expect(await screen.findByText(isolated(picture.en))).toBeTruthy();
    expect(screen.queryByText(isolated(id))).toBeNull();
    expect(screen.getByText(isolated('Hello!'))).toBeTruthy();
  });

  // A listening item asks with a sound and no words, so its answer needs the clip beside it.
  it('put a missed listening clip beside its answer, to be heard again', async () => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
    try {
      const clip = 'https://media.test/birci.mp3';
      show({
        results: { ...results, mistakes: [{ exerciseId: 'l1', verdict: 'wrong', correction: 'Tu birçî yî?' }, { exerciseId: 'm1', verdict: 'wrong', prompt: 'Silav!', correction: 'Hello!' }] },
        exercises: [
          { id: 'l1', type: 'listening', ask: 'hear', audioUrl: clip, bank: ['Tu', 'birçî', 'yî?', 'germ'] },
          { id: 'm1', type: 'multiple_choice', ask: 'meaning', prompt: 'Silav!', options: ['Hello!', 'No!'] },
        ],
      });
      expect(await screen.findByText(isolated('Tu birçî yî?'))).toBeTruthy();
      // One clip, beside the listening answer and not the one asked in words.
      const hear = screen.getAllByRole('button', { name: 'Play audio' });
      expect(hear).toHaveLength(1);
      fireEvent.click(hear[0]!);
      expect(FakeAudio.of(clip)?.paused).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// The lesson's name, an apple at the end of the line, and the lesson's address, with nothing about who shares; reviews have none.
describe('sharing the lesson', () => {
  const asked = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id, type: 'multiple_choice' as const }));
  // Six asked, the third missed the first time.
  const went: SessionResults = { ...results, correct: 5, total: 6, accuracy: 5 / 6, mistakes: [{ exerciseId: 'e3', verdict: 'wrong' }] };
  const lesson = { title: 'Hello!' };
  const sheet = () => vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  const said = (share: ReturnType<typeof sheet>): string => (share.mock.calls[0]?.[0] as { message: string } | undefined)?.message ?? '';

  afterEach(() => vi.restoreAllMocks());

  it('shares the lesson by its name, with the lesson’s own address under it', async () => {
    const share = sheet();
    show({ results: went, exercises: asked, lesson });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]?.[0]).toEqual({ message: 'I finished “Hello!” in Kurdish on Hevalo. 🍎\nhttps://hevalo.app/win/lesson' });
  });

  it('stands over the ways on, once, and leaves the main one the foot of the screen', async () => {
    show({ results: went, exercises: asked, lesson, next: { lessonId: 'l2', title: 'Malbat' }, onNext: () => undefined, onPath: () => undefined });
    const share = await screen.findByRole('button', { name: 'Share' });
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
    // Beside "Back to the path", and before the button that goes on.
    const back = screen.getByRole('button', { name: 'Back to the path' });
    const onward = screen.getByRole('button', { name: 'Next lesson' });
    expect(back.parentElement).toBe(share.parentElement);
    expect(share.compareDocumentPosition(onward) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing comes after the way on in the bar.
    expect(onward.parentElement!.lastElementChild).toBe(onward);
  });

  it('shares nothing that says whose lesson it was', async () => {
    const share = sheet();
    show({ results: went, exercises: asked, lesson });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    const text = said(share);
    expect(text.length).toBeGreaterThan(0);
    const who = testAuth.user;
    for (const theirs of [who.username, who.email, '/users/', '/profile', '@']) expect(text, theirs).not.toContain(theirs);
    // One address: the page of a finished lesson, which is about nobody.
    expect(text.match(/https?:\/\/\S+/g)).toEqual(['https://hevalo.app/win/lesson']);
  });

  it('says a Kurdish lesson when it has no name to give, and nothing of how the lesson went', async () => {
    const share = sheet();
    show({ results: { ...went, correct: 4, total: 5, accuracy: 0.8 }, exercises: asked, skipped: 1, lesson: { title: null } });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(said(share)).toBe('I finished a Kurdish lesson on Hevalo. 🍎\nhttps://hevalo.app/win/lesson');
  });

  it('is no way on: sharing opens neither the streak’s moment nor anything after it', async () => {
    sheet();
    const onDone = vi.fn();
    show({ results: went, exercises: asked, lesson, moments: { ...NO_MOMENTS, streakKept: true }, onDone });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(screen.queryByTestId('lesson-streak-day')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    // The results remain, with their way on.
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('offers no Share on a review: practice is not a lesson finished', async () => {
    show({ results: went, exercises: asked });
    await screen.findByRole('button', { name: 'Done' });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});
