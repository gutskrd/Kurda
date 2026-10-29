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
import type { QuestDay } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
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

describe('the way on', () => {
  const day: QuestDay = {
    date: '2026-10-29',
    monthDone: 2,
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

    // the flame first; a tap moves on to the week
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
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
