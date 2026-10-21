// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { LessonPath } from './LessonPath';
import type { CourseMap, SkillNode } from './types';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const lesson = (id: string, title: string, completed = false) => ({ lessonId: id, position: 1, title, completed });
const skill = (over: Partial<SkillNode>): SkillNode => ({ skillId: 's', level: 1, title: 'S', state: 'locked', strength: 0, hasGrammar: false, firstLessonId: null, ...over });

const MAP: CourseMap = {
  course: { id: 'c1', title: 'Kurmanji for Beginners' },
  units: [
    {
      unitId: 'u1',
      title: 'Basics',
      skills: [
        skill({ skillId: 'greet', title: 'Greetings', state: 'gold', strength: 92, hasGrammar: true, firstLessonId: 'g1', lessons: [lesson('g1', 'Silav', true), lesson('g2', 'Rojbaş', true)] }),
        skill({ skillId: 'num', title: 'Numbers', state: 'decayed', strength: 31, firstLessonId: 'n1', lessons: [lesson('n1', 'Yek heta deh', true)] }),
      ],
    },
    {
      unitId: 'u2',
      title: 'Family & Food',
      skills: [
        skill({
          skillId: 'fam',
          title: 'Family',
          state: 'unlocked',
          firstLessonId: 'f2',
          lessons: [lesson('f1', 'Dê û bav', true), lesson('f2', 'Xwişk û bira'), lesson('f3', 'Malbat')],
        }),
        skill({ skillId: 'food', title: 'Food', lessons: [lesson('o1', 'Nan û av')] }),
      ],
    },
  ],
};

function client() {
  testAuth.client = fakeClient({ 'GET /skills/greet/grammar': ok({ grammarMd: '# Silavkirin\n\n**Silav** — hello' }) });
}

const button = (name: string) => screen.getByRole('button', { name });

describe('the lesson path', () => {
  it('draws every skill as a stop that says what it is, with review and each unit’s trophy', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={3} onFocus={() => undefined} />);
    expect(screen.getByText('Unit 1')).toBeTruthy();
    expect(screen.getByText('Greetings · Numbers')).toBeTruthy();
    expect(screen.getByText('2 of 2 done')).toBeTruthy();
    expect(button('Greetings, done, and strong, 2 of 2 lessons done')).toBeTruthy();
    expect(button('Numbers, done, ready for a refresh, 1 of 1 lessons done')).toBeTruthy();
    expect(button('Unit 1 trophy, earned')).toBeTruthy();
    // review sits just before the skill to do now
    expect(button('Review, words ready: 3')).toBeTruthy();
    expect(button('Family, you are here, 1 of 3 lessons done')).toBeTruthy();
    expect(button('Food, locked, 0 of 1 lessons done')).toBeTruthy();
    expect(button('Unit 2 trophy, not earned yet')).toBeTruthy();
  });

  it('starts the next lesson in one tap from the bubble over the current skill', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Continue: Family'));
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { lessonId: 'f2' });
  });

  it('opens a sheet on a stop: its lessons as ways in, how far along, and one thing to do', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Family, you are here, 1 of 3 lessons done'));
    expect(screen.getByText('Unit 2 · Family & Food')).toBeTruthy();
    expect(screen.getByText('1 of 3 lessons done')).toBeTruthy();
    // a finished lesson can be played again on its own; one not open yet is not a way in
    fireEvent.click(button('Dê û bav, done'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Lesson', { lessonId: 'f1' });
    fireEvent.click(button('Family, you are here, 1 of 3 lessons done'));
    expect(screen.queryByRole('button', { name: 'Malbat, not open yet' })).toBeNull();
    fireEvent.click(button('Continue'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Lesson', { lessonId: 'f2' });
  });

  it('says kindly what opens a locked skill, and sends a rusty one to review', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Food, locked, 0 of 1 lessons done'));
    expect(screen.getByText('Finish “Family” to open this one.')).toBeTruthy();
    fireEvent.click(button('Close'));
    fireEvent.click(button('Numbers, done, ready for a refresh, 1 of 1 lessons done'));
    fireEvent.click(button('Start a review'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice');
  });

  it('opens a unit’s guide from its banner, fetching each note once', async () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Guide to Basics'));
    expect(await screen.findByText('Silavkirin')).toBeTruthy();
    const calls = (testAuth.client as unknown as { calls: { path: string }[] }).calls;
    expect(calls.filter((c) => c.path === '/skills/greet/grammar')).toHaveLength(1);
    // a unit without notes has no guide to offer
    expect(screen.queryByRole('button', { name: 'Guide to Family & Food' })).toBeNull();
    expect(within(document.body).getByText('Guide to Basics')).toBeTruthy();
  });
});
