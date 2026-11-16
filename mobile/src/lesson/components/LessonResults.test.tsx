// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../../reports/testing/netinfo'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
// a badge earned meanwhile waits on the celebration (badges/BadgeCelebrationHost.tsx)
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Share } from 'react-native';
import { WORD_PICTURES, type QuestDay } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { characterLayers } from '../../characters/layers';
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
    // under ten seconds an answer: quick
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
    // no tree planted, a replay, or a server without trees: the results carry nothing about it
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

    // practice has no course of its own; a lesson that went badly is still a lesson done
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
    expect(drawn).toContain(characterLayers('hevalo', 'head').body);
    expect(drawn).not.toContain(characterLayers('hevalo', 'full').body);
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

    // the streak on its card (the flame before it is for the day the fire grew, and the sixth is not one)
    expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
    expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // then the quests this lesson moved, and on
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
});

describe('the mistakes', () => {
  // the server names a picture by its catalogue id, which is not always what the picture shows ("ewe" is a sheep)
  it('name a missed picture by what it shows', async () => {
    const [id, picture] = Object.entries(WORD_PICTURES).find(([key, p]) => key !== p.en)!;
    show({
      results: { ...results, mistakes: [{ exerciseId: 'p1', verdict: 'wrong', prompt: picture.ku, correction: id }, { exerciseId: 'm1', verdict: 'wrong', prompt: 'Silav!', correction: 'Hello!' }] },
      exercises: [
        { id: 'p1', type: 'multiple_choice', ask: 'picture', prompt: picture.ku, options: [id, 'apple'] },
        { id: 'm1', type: 'multiple_choice', ask: 'meaning', prompt: 'Silav!', options: ['Hello!', 'No!'] },
      ],
    });
    expect(await screen.findByText(picture.en)).toBeTruthy();
    expect(screen.queryByText(id)).toBeNull();
    expect(screen.getByText('Hello!')).toBeTruthy();
  });
});

/*
 * The quiet Share over the ways on of a lesson's results: the lesson by its
 * name, a square for each exercise as it went, and the site's address, with
 * nothing of who is sharing. A review has none.
 */
describe('sharing the lesson', () => {
  const asked = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id, type: 'multiple_choice' as const }));
  // six asked, the third missed the first time
  const went: SessionResults = { ...results, correct: 5, total: 6, accuracy: 5 / 6, mistakes: [{ exerciseId: 'e3', verdict: 'wrong' }] };
  const lesson = { title: 'Hello!', putOff: [] };
  const sheet = () => vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  const said = (share: ReturnType<typeof sheet>): string => (share.mock.calls[0]?.[0] as { message: string } | undefined)?.message ?? '';

  afterEach(() => vi.restoreAllMocks());

  it('shares the lesson by its name, a square for each exercise in order, and the site’s address', async () => {
    const share = sheet();
    show({ results: went, exercises: asked, lesson });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]?.[0]).toEqual({ message: 'I finished “Hello!” in Kurdish on Hevalo.\n\n🟩🟩🟨🟩🟩🟩\n\nhttps://hevalo.app' });
  });

  it('stands over the ways on, once, and leaves the main one the foot of the screen', async () => {
    show({ results: went, exercises: asked, lesson, next: { lessonId: 'l2', title: 'Malbat' }, onNext: () => undefined, onPath: () => undefined });
    const share = await screen.findByRole('button', { name: 'Share' });
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
    // beside "Back to the path", and before the button that goes on
    const back = screen.getByRole('button', { name: 'Back to the path' });
    const onward = screen.getByRole('button', { name: 'Next lesson' });
    expect(back.parentElement).toBe(share.parentElement);
    expect(share.compareDocumentPosition(onward) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // nothing comes after the way on in the bar
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
    // one address, and it is the site's front door
    expect(text.match(/https?:\/\/\S+/g)).toEqual(['https://hevalo.app']);
  });

  it('leaves an exercise that was put off out of the squares, and says a Kurdish lesson when it has no name to give', async () => {
    const share = sheet();
    show({ results: { ...went, correct: 4, total: 5, accuracy: 0.8 }, exercises: asked, skipped: 1, lesson: { title: null, putOff: ['e6'] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(said(share)).toBe('I finished a Kurdish lesson on Hevalo.\n\n🟩🟩🟨🟩🟩\n\nhttps://hevalo.app');
  });

  it('is no way on: sharing opens neither the streak’s moment nor anything after it', async () => {
    sheet();
    const onDone = vi.fn();
    show({ results: went, exercises: asked, lesson, moments: { ...NO_MOMENTS, streakKept: true }, onDone });
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(screen.queryByTestId('lesson-streak-day')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    // and the results are still there, with their way on
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('offers no Share on a review: practice is not a lesson finished', async () => {
    show({ results: went, exercises: asked });
    await screen.findByRole('button', { name: 'Done' });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});
