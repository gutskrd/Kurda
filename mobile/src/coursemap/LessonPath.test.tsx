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
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Animated } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { LessonPath, PinnedUnit, type UnitPlace } from './LessonPath';
import { TONES } from './path';
import { UnitRailSheet } from './PathWorld';
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
    // between the units, where in the course the next one lies; the first has the course's heading above it instead
    expect(screen.getAllByTestId('lp-unit-divider')).toHaveLength(1);
    expect(screen.getByText('Unit 2 of 2')).toBeTruthy();
  });

  /*
   * "Start" bobs over the current skill for as long as the path is in front
   * of somebody who has not asked for less motion, and says so while it does.
   * Under Reduce Motion it stands still from the first frame.
   */
  it('bobs the Start pill while the path is in view, and holds it still under Reduce Motion', async () => {
    client();
    patchReactNativeWeb({ reduceMotion: false });
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    expect(await screen.findByTestId('lp-callout-bobbing')).toBeTruthy();
    cleanup();
    patchReactNativeWeb({ reduceMotion: true });
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(button('Continue: Family')).toBeTruthy();
    expect(screen.queryByTestId('lp-callout-bobbing')).toBeNull();
  });

  it('starts the next lesson in one tap from the bubble over the current skill', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Continue: Family'));
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { lessonId: 'f2', courseId: 'c1' });
  });

  it('opens a sheet on a stop: its lessons as ways in, how far along, and one thing to do', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Family, you are here, 1 of 3 lessons done'));
    expect(screen.getByText('Unit 2 · Family & Food')).toBeTruthy();
    expect(screen.getByText('1 of 3 lessons done')).toBeTruthy();
    // what the lesson it opens pays, in the server's own numbers
    expect(screen.getByText('+10–20 XP')).toBeTruthy();
    // a finished lesson can be played again on its own; one not open yet is not a way in
    fireEvent.click(button('Dê û bav, done'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Lesson', { lessonId: 'f1', courseId: 'c1' });
    fireEvent.click(button('Family, you are here, 1 of 3 lessons done'));
    expect(screen.queryByRole('button', { name: 'Malbat, not open yet' })).toBeNull();
    fireEvent.click(button('Continue'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Lesson', { lessonId: 'f2', courseId: 'c1' });
  });

  it('promises a replay its smaller share', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Greetings, done, and strong, 2 of 2 lessons done'));
    expect(screen.getByText('+3–5 XP')).toBeTruthy();
  });

  // Hevalo stands by the skill to do now, and a tap on him opens it as the stop itself does
  it('has Hevalo beside the current skill, opening its sheet when he is tapped', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    const mascot = screen.getByTestId('lp-mascot');
    expect(screen.getAllByTestId('lp-mascot')).toHaveLength(1);
    fireEvent.click(within(mascot).getByRole('img'));
    expect(screen.getByText('Unit 2 · Family & Food')).toBeTruthy();
  });

  it('says kindly what opens a locked skill, and sends a rusty one to review', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Food, locked, 0 of 1 lessons done'));
    expect(screen.getByText('Finish “Family” to open this one.')).toBeTruthy();
    // the sheet's ✕, after the dimmed page behind it
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    fireEvent.click(button('Numbers, done, ready for a refresh, 1 of 1 lessons done'));
    fireEvent.click(button('Start a review'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice');
  });

  // the guide is the first stop of its unit's path, an open book
  it('opens a unit’s guide from the book at the head of its path, fetching each note once', async () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    expect(screen.getAllByTestId('lp-node-guide')).toHaveLength(1);
    fireEvent.click(button('Guide to Basics'));
    expect(await screen.findByText('Silavkirin')).toBeTruthy();
    const calls = (testAuth.client as unknown as { calls: { path: string }[] }).calls;
    expect(calls.filter((c) => c.path === '/skills/greet/grammar')).toHaveLength(1);
    // a unit without notes has no guide to offer
    expect(screen.queryByRole('button', { name: 'Guide to Family & Food' })).toBeNull();
    expect(within(document.body).getByText('Guide to Basics')).toBeTruthy();
  });

  /*
   * Each unit's stops stand on its own land: the first unit's has Sêvan's
   * gate beside its route and Hamo by its chest, and the learner stands on
   * the stop to do now — once, whatever the path holds. They are pictures: a
   * screen reader hears the stops, not them.
   */
  it('stands each unit on its own land, with its landmark, its person and the learner on today’s stop', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    expect(screen.getAllByTestId('lp-land')).toHaveLength(2);
    expect(screen.getByTestId('lp-landmark-gate')).toBeTruthy();
    expect(screen.getByTestId('lp-landmark-teahouse')).toBeTruthy();
    expect(screen.getAllByTestId('lp-learner')).toHaveLength(1);
    // Hamo keeps both of the first two units: by each one's chest
    expect(screen.getAllByTestId('lp-host-hamo')).toHaveLength(2);
    // the stop to do now carries its lessons as lights on its side, one each
    expect(screen.getByTestId('lp-lights').children).toHaveLength(3);
    for (const id of ['lp-learner', 'lp-landmark-gate']) expect(screen.getByTestId(id).closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getAllByTestId('lp-host-hamo')[0]!.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('draws only the units it is told are near in full, and the rest as their ground alone', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} near={new Set(['u2'])} />);
    expect(screen.queryByTestId('lp-landmark-gate')).toBeNull();
    expect(screen.getByTestId('lp-landmark-teahouse')).toBeTruthy();
    // every stop is still a button that says what it is
    expect(button('Greetings, done, and strong, 2 of 2 lessons done')).toBeTruthy();
  });

  it('opens the rail of units from a unit banner’s map button, and goes to the unit chosen there', () => {
    client();
    const openRail = vi.fn();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} onOpenRail={openRail} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Course map' })[1]!);
    expect(openRail).toHaveBeenCalledTimes(1);
    cleanup();
    const pick = vi.fn();
    const units = [
      { unitId: 'u1', number: 1, title: 'Basics', tone: TONES.dark.clay, done: 2, total: 2, here: false },
      { unitId: 'u2', number: 2, title: 'Family & Food', tone: TONES.dark.saffron, done: 0, total: 2, here: true },
    ];
    renderWithProviders(<UnitRailSheet units={units} open onClose={() => undefined} onPick={pick} />);
    const here = button('Unit 2, Family & Food');
    expect(here.getAttribute('aria-selected')).toBe('true');
    expect(button('Unit 1, Basics').getAttribute('aria-selected')).toBe('false');
    fireEvent.click(button('Unit 1, Basics'));
    expect(pick).toHaveBeenCalledWith('u1');
  });

  /*
   * A later unit whose first skill is closed offers a test to jump to it: its
   * first stop in the unit's colour with "Jump here?" over it, and a sheet
   * that says what jumping does before it starts.
   */
  it('offers to jump ahead to a later unit, and starts its test from a sheet that explains it', () => {
    client();
    const later: CourseMap = {
      ...MAP,
      units: [
        ...MAP.units,
        { unitId: 'u3', title: 'Out and about', skills: [skill({ skillId: 'town', title: 'Town', lessons: [lesson('t1', 'Bajar')] })] },
      ],
    };
    renderWithProviders(<LessonPath map={later} due={0} onFocus={() => undefined} />);
    // never the unit the learner is in
    expect(screen.getAllByTestId('lp-node-jump')).toHaveLength(1);
    expect(screen.getByText('Jump here?')).toBeTruthy();
    // the stop and the bubble over it both say what they offer, and both open it
    const offers = screen.getAllByRole('button', { name: 'Jump ahead to Unit 3: a short test opens it' });
    expect(offers).toHaveLength(2);
    fireEvent.click(offers[1]!);
    const sheet = screen.getByTestId('lp-jump-sheet');
    expect(within(sheet).getByRole('heading', { name: 'Jump to Unit 3?' })).toBeTruthy();
    expect(within(sheet).getByText('Pass a short test to open Unit 3. Lessons you skip stay open to come back to.')).toBeTruthy();
    expect(within(sheet).getByText('About 10 questions')).toBeTruthy();
    expect(within(sheet).getByText('Passed with 2 mistakes or fewer')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Start the test' }));
    expect(navigation.navigate).toHaveBeenCalledWith('JumpTest', { courseId: 'c1', unitId: 'u3' });
  });

  /*
   * Scrolled into the next unit, the pinned header turns into it: the new
   * colour and name fade in over the old (opacity alone), which goes once they
   * have — or, for anyone who asked for less motion, it simply changes.
   * Animations finish at once in tests, so what is checked is the fade asked
   * for, and where it ends.
   */
  it('cross-fades the pinned header into the next unit, and changes it at once under Reduce Motion', async () => {
    const first: UnitPlace = { unitId: 'u1', top: 0, bannerBottom: 120, bottom: 600, number: 1, title: 'Basics', tone: TONES.dark.meadow, done: 2, total: 2, here: false };
    const second: UnitPlace = { ...first, unitId: 'u2', number: 2, title: 'Family & Food', tone: TONES.dark.river };
    const fades = vi.spyOn(Animated, 'timing');
    const turn = async () => {
      const view = renderWithProviders(<PinnedUnit unit={first} />);
      // the number over the name, said as one heading
      expect(screen.getByRole('heading', { name: 'Unit 1, Basics' })).toBeTruthy();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      // the header's own arrival is not what is counted here: only what the change of unit asks for
      fades.mockClear();
      view.rerender(<PinnedUnit unit={second} />);
      expect(screen.getByRole('heading', { name: 'Unit 2, Family & Food' })).toBeTruthy();
      expect(screen.queryByText('Basics')).toBeNull();
      cleanup();
      return fades.mock.calls.map(([, config]) => config);
    };

    patchReactNativeWeb({ reduceMotion: false });
    expect(await turn()).toEqual([expect.objectContaining({ toValue: 1, duration: 200, useNativeDriver: true })]);
    patchReactNativeWeb({ reduceMotion: true });
    expect(await turn()).toEqual([]);
  });
});
