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
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Animated } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { LessonPath, PinnedUnit, type UnitPlace } from './LessonPath';
import { TONES } from './path';
import { UnitRailSheet } from './PathWorld';
import type { CourseMap, SkillNode } from './types';
import { ICON_PATHS } from '../theme/icon-paths';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const lesson = (id: string, title: string, completed = false, times?: number) => ({ lessonId: id, position: 1, title, completed, ...(times !== undefined ? { times } : {}) });
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

/** A course in three sections: the first finished, the learner in the second, the third shut. */
function levelled(id = 'c2'): CourseMap {
  const done = (key: string, times: number[]) =>
    skill({ skillId: key, title: `Topic ${key}`, state: 'gold', strength: 90, firstLessonId: `${key}1`, lessons: times.map((t, i) => lesson(`${key}${i + 1}`, `Lesson ${key}${i + 1}`, true, t)) });
  const shut = (key: string) => skill({ skillId: key, title: `Topic ${key}`, firstLessonId: `${key}1`, lessons: [lesson(`${key}1`, `Lesson ${key}1`)] });
  return {
    course: { id, title: 'The Kurmanji Road' },
    units: [
      { unitId: 'r1', title: 'Hello', level: 'A1', skills: [done('a', [1, 1]), done('b', [2, 1])], story: { slug: 'road-01-tale', title: 'Mêvan' } },
      {
        unitId: 'r2',
        title: 'Family',
        level: 'A2',
        skills: [
          done('c', [3, 3]),
          skill({ skillId: 'd', title: 'Topic d', state: 'unlocked', firstLessonId: 'd2', lessons: [lesson('d1', 'Lesson d1', true, 1), lesson('d2', 'Lesson d2'), lesson('d3', 'Lesson d3')] }),
        ],
        story: { slug: 'road-02-tale', title: 'Malbat' },
      },
      { unitId: 'r3', title: 'House', level: 'A2', skills: [shut('e')] },
      { unitId: 'r4', title: 'Market', level: 'B1', skills: [shut('f')] },
    ],
  };
}

function client() {
  testAuth.client = fakeClient({ 'GET /skills/greet/grammar': ok({ grammarMd: '# Silavkirin\n\n**Silav** — hello' }) });
}

const button = (name: string) => screen.getByRole('button', { name });

describe('the lesson path', () => {
  it('draws every skill as a stop that says what it is, its round once it has an apple, with review and each unit’s end', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={3} onFocus={() => undefined} />);
    // A course without levels is one unnamed section, and its first unit opens under its heading.
    expect(screen.getByRole('heading', { name: 'Chapter 1, Basics' })).toBeTruthy();
    expect(screen.queryByText(/Section/)).toBeNull();
    expect(button('Greetings, done, and strong, round 2 of 3, 0 of 2 lessons')).toBeTruthy();
    expect(button('Numbers, done, ready for a refresh, round 2 of 3, 0 of 1 lessons')).toBeTruthy();
    expect(button('Chapter 1 trophy, earned')).toBeTruthy();
    // Review sits just before the current skill.
    expect(button('Review, words ready: 3')).toBeTruthy();
    expect(button('Family, you are here, 1 of 3 lessons done')).toBeTruthy();
    expect(button('Food, locked, 0 of 1 lessons done')).toBeTruthy();
    expect(button('Chapter 2 trophy, not earned yet')).toBeTruthy();
    // A divider with the next unit's number and name sits between units.
    expect(screen.getAllByTestId('lp-unit-divider')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Chapter 2, Family & Food' })).toBeTruthy();
  });

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

  it('speaks the course’s own dialect in the bubble over the stop to do now, whatever the reader’s language', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    expect(within(button('Continue: Family')).getByText('Berdewam bike!')).toBeTruthy();
    cleanup();
    renderWithProviders(<LessonPath map={MAP} dialect="sorani" due={0} onFocus={() => undefined} />);
    expect(within(button('Continue: Family')).getByText('بەردەوام بە!')).toBeTruthy();
  });

  it('stands a little scene and a painted chest beside each unit’s road, out of the screen reader’s way', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    // Unit 1 has room for a chest beside its second stop, and Hevalo eats his apple beside its third, there being no
    // fourth; he is not by the stop to do now there, so he is not drawn twice.
    const scene = screen.getByTestId('lp-scene-apple');
    expect(scene.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByTestId('lp-chest').length).toBeGreaterThan(0);
    for (const chest of screen.getAllByTestId('lp-chest')) expect(chest.getAttribute('aria-hidden')).toBe('true');
    // A tap on him is his own moment, not a stop's card.
    fireEvent.click(screen.getByTestId('lp-scene-apple-tap'));
    expect(screen.queryByTestId('lp-card-go')).toBeNull();
  });

  it('has Hevalo eat his apple beside the stop to do now in its chapter, rather than stand there', () => {
    client();
    const first: CourseMap = {
      ...MAP,
      units: [
        {
          ...MAP.units[0]!,
          skills: MAP.units[0]!.skills.map((sk, k) => (k === 1 ? { ...sk, state: 'unlocked' as const, strength: 0, lessons: [lesson('n1', 'Yek heta deh')] } : sk)),
        },
      ],
    };
    renderWithProviders(<LessonPath map={first} due={0} onFocus={() => undefined} />);
    expect(button('Start: Numbers')).toBeTruthy();
    expect(screen.getAllByTestId('lp-scene-apple')).toHaveLength(1);
    expect(screen.queryByTestId('lp-mascot')).toBeNull();
  });

  it('sets its chapter’s vignette in the banner, numbers each milestone, and shows what the lesson up next is', () => {
    client();
    const talk: CourseMap = {
      ...MAP,
      units: MAP.units.map((u, i) => (i === 1 ? { ...u, skills: u.skills.map((sk, k) => (k === 0 ? { ...sk, lessons: (sk.lessons ?? []).map((l) => ({ ...l, kind: 'talk' as const })) } : sk)) } : u)),
    };
    renderWithProviders(<LessonPath map={talk} due={0} onFocus={() => undefined} />);
    // The first chapter's banner: Hamo's blue gate, Hevalo peeking round it, out of the screen reader's way.
    expect(screen.getByTestId('lp-chapter-art-door').getAttribute('aria-hidden')).toBe('true');
    // Each chapter ends at its milestone, its number on its seal.
    const [first, second] = screen.getAllByTestId('lp-node-trophy');
    expect(within(first!).getByText('1')).toBeTruthy();
    expect(within(second!).getByText('2')).toBeTruthy();
    // The stop to do now wears the glyph of a conversation.
    const now = button('Family, you are here, 1 of 3 lessons done');
    expect(now.innerHTML).toContain(ICON_PATHS['lesson-talk'][0]);
  });

  it('starts the next lesson in one tap from the bubble over the current skill', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Continue: Family'));
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { lessonId: 'f2', courseId: 'c1' });
  });

  it('opens a violet card under the stop to do now: its name, which lesson is next, and one button that says what it pays', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    const stop = button('Family, you are here, 1 of 3 lessons done');
    expect(stop.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(stop);
    expect(stop.getAttribute('aria-expanded')).toBe('true');
    const card = screen.getByTestId('lp-card-go');
    expect(within(card).getByRole('heading', { name: 'Family' })).toBeTruthy();
    expect(within(card).getByText('Lesson 2 of 3')).toBeTruthy();
    // A tap anywhere else on the road closes it, as does its stop again.
    fireEvent.click(screen.getByTestId('lp-card-close'));
    expect(screen.queryByTestId('lp-card-go')).toBeNull();
    fireEvent.click(stop);
    fireEvent.click(stop);
    expect(screen.queryByTestId('lp-card-go')).toBeNull();
    // Its one button, with the XP the lesson pays in the server's numbers.
    fireEvent.click(stop);
    fireEvent.click(within(screen.getByTestId('lp-card-go')).getByRole('button', { name: 'Continue, +10–20 XP' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Lesson', { lessonId: 'f2', courseId: 'c1' });
    expect(screen.queryByTestId('lp-card-go')).toBeNull();
  });

  it('ends each chapter with Hamo’s story as its prize, shut until the chapter is done, and names the chapter on its way', () => {
    client();
    const road: CourseMap = {
      ...MAP,
      units: [
        { ...MAP.units[0]!, story: { slug: 'road-01-mevan-cay-u-sev', title: 'Mêvan, çay û sêv' } },
        { ...MAP.units[1]!, story: { slug: 'road-02-mevane-be-simbel', title: 'Mêvanê bê simbêl' } },
      ],
      upcoming: { number: 3, title: 'House and village', recordedBy: 'hamo' },
    };
    renderWithProviders(<LessonPath map={road} due={0} onFocus={() => undefined} />);
    // The story takes the trophy's place at the end of a chapter.
    expect(screen.queryByRole('button', { name: /trophy/ })).toBeNull();
    // Chapter 1 is done: complete, its story opens in the reader, and its review is a tap away.
    fireEvent.click(button('Hamo’s story: Mêvan, çay û sêv'));
    expect(screen.getByTestId('lp-chapter-complete')).toBeTruthy();
    expect(screen.getByText('The chapter ends with a tale Hamo tells, in the words you have learned. Read it and hear him tell it.')).toBeTruthy();
    fireEvent.click(button('Practise this chapter'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice', { mode: 'unit', unitId: 'u1' });
    fireEvent.click(button('Hamo’s story: Mêvan, çay û sêv'));
    fireEvent.click(button('Read the story'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('StoryReader', { slug: 'road-01-mevan-cay-u-sev' });
    // Chapter 2 is not: its story is locked and says how far the chapter is.
    fireEvent.click(button('Hamo’s story: Mêvanê bê simbêl, opens when the chapter is done'));
    expect(screen.getByText('Finish the chapter, and Hamo tells you how it ends.')).toBeTruthy();
    expect(screen.getByText('0 of 2 done')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read the story' })).toBeNull();
    // The path ends at the last published chapter and says the next is being recorded.
    expect(screen.getByTestId('lp-upcoming').getAttribute('aria-label')).toBe('Chapter 3, House and village. On its way: Hamo is recording it now.');
  });

  it('promises a replay its smaller share', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Greetings, done, and strong, round 2 of 3, 0 of 2 lessons'));
    expect(screen.getByText('+3–5 XP, played again')).toBeTruthy();
  });

  it('has Hevalo beside the current skill, opening its card when he is tapped', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    const mascot = screen.getByTestId('lp-mascot');
    expect(screen.getAllByTestId('lp-mascot')).toHaveLength(1);
    fireEvent.click(within(mascot).getByRole('img'));
    expect(within(screen.getByTestId('lp-card-go')).getByRole('heading', { name: 'Family' })).toBeTruthy();
  });

  it('says kindly what opens a locked skill, and sends a rusty one to review', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    fireEvent.click(button('Food, locked, 0 of 1 lessons done'));
    expect(screen.getByText('Finish “Family” to open this one.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(button('Numbers, done, ready for a refresh, round 2 of 3, 0 of 1 lessons'));
    fireEvent.click(button('Start a review'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice');
  });

  /* A review left part-way is carried on from the road, in its own session rather than a new one beside it. */
  it('carries on a review left part-way from its stop', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={3} openReview="p9" onFocus={() => undefined} />);
    fireEvent.click(button('Review, words ready: 3'));
    fireEvent.click(button('Continue review'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice', { sessionId: 'p9' });
  });

  it('opens a unit’s guide from the book on its heading, fetching each note once', async () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    expect(screen.queryByTestId('lp-node-guide')).toBeNull();
    fireEvent.click(within(screen.getByTestId('lp-unit-head')).getByRole('button', { name: 'Guide to Basics' }));
    expect(await screen.findByText('Silavkirin')).toBeTruthy();
    const calls = (testAuth.client as unknown as { calls: { path: string }[] }).calls;
    expect(calls.filter((c) => c.path === '/skills/greet/grammar')).toHaveLength(1);
    expect(within(document.body).getByText('Guide to Basics')).toBeTruthy();
  });

  /*
   * Each unit stands on its own land: the first has its landmark beside the road, and the learner stands once on the
   * current stop. No course characters stand on the map, and the pictures are hidden from screen readers.
   */
  it('stands each unit on its own land, with its landmark, and no figures pasted on the map', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} />);
    expect(screen.getAllByTestId('lp-land')).toHaveLength(2);
    expect(screen.getByTestId('lp-landmark-gate')).toBeTruthy();
    expect(screen.getByTestId('lp-landmark-teahouse')).toBeTruthy();
    // The stop to do now says where the learner is; no figure stands on it.
    expect(screen.queryByTestId('lp-learner')).toBeNull();
    expect(screen.queryByTestId('lp-host-hamo')).toBeNull();
    expect(screen.getByTestId('lp-landmark-gate').closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('draws only the units it is told are near in full, and the rest as their ground alone', () => {
    client();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} near={new Set(['u2'])} />);
    expect(screen.queryByTestId('lp-landmark-gate')).toBeNull();
    expect(screen.getByTestId('lp-landmark-teahouse')).toBeTruthy();
    // Every stop is still a labelled button.
    expect(button('Greetings, done, and strong, round 2 of 3, 0 of 2 lessons')).toBeTruthy();
  });

  it('opens the rail of units from a unit heading’s map button, and goes to the unit chosen there, under its section', () => {
    client();
    const openRail = vi.fn();
    renderWithProviders(<LessonPath map={MAP} due={0} onFocus={() => undefined} onOpenRail={openRail} />);
    fireEvent.click(within(screen.getByTestId('lp-unit-head')).getByRole('button', { name: 'Course map' }));
    expect(openRail).toHaveBeenCalledTimes(1);
    cleanup();
    const pick = vi.fn();
    const sections = [
      { number: 1, level: 'level.name.1' as const, units: [{ unitId: 'u1', number: 1, title: 'Basics', tone: TONES.dark.clay, done: 2, total: 2, here: false }] },
      { number: 2, level: 'level.name.2' as const, units: [{ unitId: 'u2', number: 2, title: 'Family & Food', tone: TONES.dark.saffron, done: 0, total: 2, here: true }] },
    ];
    renderWithProviders(<UnitRailSheet sections={sections} open onClose={() => undefined} onPick={pick} />);
    expect(screen.getByRole('heading', { name: 'Section 1 · Starter' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Section 2 · Beginner' })).toBeTruthy();
    const here = button('Chapter 2, Family & Food');
    expect(here.getAttribute('aria-selected')).toBe('true');
    expect(button('Chapter 1, Basics').getAttribute('aria-selected')).toBe('false');
    fireEvent.click(button('Chapter 1, Basics'));
    expect(pick).toHaveBeenCalledWith('u1');
  });

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
    // Never the learner's own unit.
    expect(screen.getAllByTestId('lp-node-jump')).toHaveLength(1);
    expect(screen.getByText('Jump here?')).toBeTruthy();
    // Both the stop and its bubble offer the jump, and both open it.
    const offers = screen.getAllByRole('button', { name: 'Jump ahead to Chapter 3: a short test opens it' });
    expect(offers).toHaveLength(2);
    fireEvent.click(offers[1]!);
    const sheet = screen.getByTestId('lp-jump-sheet');
    expect(within(sheet).getByRole('heading', { name: 'Jump to Chapter 3?' })).toBeTruthy();
    expect(within(sheet).getByText('Pass a short test to open Chapter 3. Lessons you skip stay open to come back to.')).toBeTruthy();
    expect(within(sheet).getByText('About 10 questions')).toBeTruthy();
    expect(within(sheet).getByText('Passed with 2 mistakes or fewer')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Start the test' }));
    expect(navigation.navigate).toHaveBeenCalledWith('JumpTest', { courseId: 'c1', unitId: 'u3' });
  });

  // Animations finish at once in tests, so this checks the fade requested and its end state.
  it('cross-fades the pinned header into the next unit, and changes it at once under Reduce Motion', async () => {
    const first: UnitPlace = { unitId: 'u1', top: 0, bannerBottom: 120, bottom: 600, number: 1, title: 'Basics', tone: TONES.dark.meadow, section: null, done: 2, total: 2, here: false };
    const second: UnitPlace = { ...first, unitId: 'u2', number: 2, title: 'Family & Food', tone: TONES.dark.river };
    const fades = vi.spyOn(Animated, 'timing');
    const turn = async () => {
      const view = renderWithProviders(<PinnedUnit unit={first} />);
      // Number and name, read as one heading.
      expect(screen.getByRole('heading', { name: 'Chapter 1, Basics' })).toBeTruthy();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      // Count only what the unit change requests, not the header's own arrival.
      fades.mockClear();
      view.rerender(<PinnedUnit unit={second} />);
      expect(screen.getByRole('heading', { name: 'Chapter 2, Family & Food' })).toBeTruthy();
      expect(screen.queryByText('Basics')).toBeNull();
      cleanup();
      // The vignette's own gentle loop is decorative, not part of the turn.
      return fades.mock.calls.map(([, config]) => config).filter((config) => config.isInteraction !== false);
    };

    patchReactNativeWeb({ reduceMotion: false });
    expect(await turn()).toEqual([expect.objectContaining({ toValue: 1, duration: 200, useNativeDriver: true })]);
    patchReactNativeWeb({ reduceMotion: true });
    expect(await turn()).toEqual([]);
  });

  it('names the section in the pinned header, the guide in its book on the far side', () => {
    const openGuide = vi.fn();
    const place: UnitPlace = { unitId: 'r2', top: 0, bannerBottom: 80, bottom: 600, number: 2, title: 'Family', tone: TONES.light.clay, section: 1, done: 1, total: 4, here: true, openGuide };
    renderWithProviders(<PinnedUnit unit={place} />);
    expect(screen.getByText('Section 1 · Chapter 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Section 1, Chapter 2, Family' })).toBeTruthy();
    fireEvent.click(button('Guide to Family'));
    expect(openGuide).toHaveBeenCalledTimes(1);
  });
});

describe('the path’s sections', () => {
  it('opens the section the learner is in, with a card for the one finished before it and the one still shut after it', () => {
    client();
    renderWithProviders(<LessonPath map={levelled()} due={0} onFocus={() => undefined} />);
    // The open section's first unit sits under a heading naming the section.
    expect(screen.getByText('Section 2 · Chapter 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Section 2, Chapter 2, Family' })).toBeTruthy();
    expect(button('Topic d, you are here, 1 of 3 lessons done')).toBeTruthy();
    // Each later unit starts at a divider with its name.
    expect(screen.getByRole('heading', { name: 'Chapter 3, House' })).toBeTruthy();
    // The finished section before it is a card named by its level, never its CEFR letter.
    const done = button('Section 1, Starter, First words and short sentences, Section complete, One chapter');
    expect(within(done).queryByText(/A1/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Topic a/ })).toBeNull();
    // The section after it is shut: what it is, how many chapters, what opens it, and the jump test.
    const shut = screen.getByTestId('lp-section-3');
    expect(within(shut).getByText('Intermediate')).toBeTruthy();
    expect(within(shut).getByText('One chapter')).toBeTruthy();
    expect(within(shut).getByText('Opens when Section 2 is done')).toBeTruthy();
    fireEvent.click(within(shut).getByRole('button', { name: 'Jump ahead to Chapter 4: a short test opens it' }));
    expect(within(screen.getByTestId('lp-jump-sheet')).getByRole('heading', { name: 'Jump to Chapter 4?' })).toBeTruthy();
  });

  it('opens a finished section again from its card, and folds the learner’s own into a card that says they are there', () => {
    client();
    const focus = vi.fn();
    renderWithProviders(<LessonPath map={levelled()} due={0} onFocus={focus} />);
    fireEvent.click(button('Section 1, Starter, First words and short sentences, Section complete, One chapter'));
    expect(button('Topic a, done, and strong, round 2 of 3, 0 of 2 lessons')).toBeTruthy();
    expect(screen.getByText('Section 1 · Chapter 1')).toBeTruthy();
    // The learner's own section is now a card that takes them back.
    const here = button('Section 2, Beginner, Everyday sentences and short stories, You are here, 0 of 2 chapters done');
    // The focus stop is folded away, so the screen gets nothing to scroll to.
    expect(focus).toHaveBeenLastCalledWith(null);
    fireEvent.click(here);
    expect(button('Topic d, you are here, 1 of 3 lessons done')).toBeTruthy();
  });

  // The unit's position comes from layout, which this test never measures.
  it('opens the section of a unit picked on the map, and leaves a shut section shut', () => {
    client();
    const view = renderWithProviders(<LessonPath map={levelled()} due={0} onFocus={() => undefined} onReveal={() => undefined} />);
    view.rerender(<LessonPath map={levelled()} due={0} onFocus={() => undefined} onReveal={() => undefined} reveal={{ unitId: 'r4', at: 1 }} />);
    expect(screen.queryByRole('button', { name: /^Topic f/ })).toBeNull();
    view.rerender(<LessonPath map={levelled()} due={0} onFocus={() => undefined} onReveal={() => undefined} reveal={{ unitId: 'r1', at: 2 }} />);
    expect(button('Topic a, done, and strong, round 2 of 3, 0 of 2 lessons')).toBeTruthy();
  });

  it('comes back to the section a lesson was played in, a finished one too, to show what the lesson did there', async () => {
    client();
    patchReactNativeWeb({ reduceMotion: false });
    const view = renderWithProviders(<LessonPath map={levelled('c-replay')} due={0} onFocus={() => undefined} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByTestId('lp-section-1')).toBeTruthy();
    // A lesson of Topic a, in the finished first section, played again.
    const replayed = levelled('c-replay');
    replayed.units[0]!.skills[0] = { ...replayed.units[0]!.skills[0]!, lessons: [lesson('a1', 'Lesson a1', true, 2), lesson('a2', 'Lesson a2', true, 1)] };
    view.rerender(<LessonPath map={replayed} due={0} onFocus={() => undefined} />);
    expect(button('Topic a, done, and strong, round 2 of 3, 1 of 2 lessons')).toBeTruthy();
    expect(screen.getByTestId('lp-bar')).toBeTruthy();
    // The learner's own section stays folded, to go back to.
    expect(screen.getByTestId('lp-section-2')).toBeTruthy();
    cleanup();
    patchReactNativeWeb({ reduceMotion: true });
  });

  it('tells the map of every unit what is in each section', () => {
    client();
    const course = vi.fn();
    renderWithProviders(<LessonPath map={levelled()} due={0} onFocus={() => undefined} onCourse={course} />);
    const sections = course.mock.calls.at(-1)![0] as Array<{ number: number; level: string; units: Array<{ unitId: string; here: boolean }> }>;
    expect(sections.map((s) => [s.number, s.level, s.units.map((u) => u.unitId)])).toEqual([
      [1, 'level.name.1', ['r1']],
      [2, 'level.name.2', ['r2', 'r3']],
      [3, 'level.name.3', ['r4']],
    ]);
    expect(sections[1]!.units[0]!.here).toBe(true);
  });
});

describe('a topic’s bar and wax seal', () => {
  it('puts a bar over the topic to do now with a piece for each lesson, and makes a finished one a wax seal, an apple for each round', async () => {
    client();
    renderWithProviders(<LessonPath map={levelled()} due={0} onFocus={() => undefined} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    // Only d, the topic to do now, wears its bar, its first piece filled; c, finished, is a wax seal instead, gold with
    // its three apples.
    expect(screen.getAllByTestId('lp-bar')).toHaveLength(1);
    expect(screen.getAllByTestId('lp-bar-filled')).toHaveLength(1);
    expect(screen.getAllByTestId(/^lp-wax/).length).toBeGreaterThan(0);
    const c = button('Topic c, done, and strong, all 3 rounds done');
    expect(within(c).getByTestId('lp-wax-3-gold')).toBeTruthy();
    // Its card shows its three apples, that all three rounds are played, and its seal with one, two and three apples.
    fireEvent.click(c);
    expect(screen.getByTestId('lp-card-apples-3')).toBeTruthy();
    expect(screen.getByText('All 3 rounds done')).toBeTruthy();
    expect(screen.getByTestId('lp-wax-legend')).toBeTruthy();
  });

  it('says the round a finished topic is in, and plays it again from the lesson finished fewest times', async () => {
    client();
    renderWithProviders(<LessonPath map={levelled()} due={0} onFocus={() => undefined} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(button('Section 1, Starter, First words and short sentences, Section complete, One chapter'));
    // Both its topics are wax seals with their first apple, and neither wears a bar.
    expect(screen.getAllByTestId('lp-wax-1')).toHaveLength(2);
    expect(screen.queryByTestId('lp-bar')).toBeNull();
    fireEvent.click(button('Topic b, done, and strong, round 2 of 3, 1 of 2 lessons'));
    expect(screen.getByText('Round 2 of 3 · 1 of 2 lessons')).toBeTruthy();
    fireEvent.click(button('Practise again, +3–5 XP, played again'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Lesson', { lessonId: 'b2', courseId: 'c2' });
  });

  it('fills the bar, turns the stop into its wax seal with its first apple on coming back from a lesson that made a round whole', async () => {
    client();
    patchReactNativeWeb({ reduceMotion: false });
    const before = levelled('c-return');
    const after = levelled('c-return');
    // Topic d's first round is completed: d2 and d3 finished since.
    after.units[1]!.skills[1] = { ...after.units[1]!.skills[1]!, state: 'completed', lessons: [lesson('d1', 'Lesson d1', true, 1), lesson('d2', 'Lesson d2', true, 1), lesson('d3', 'Lesson d3', true, 1)] };
    after.units[2]!.skills[0] = { ...after.units[2]!.skills[0]!, state: 'unlocked' };
    const view = renderWithProviders(<LessonPath map={before} due={0} onFocus={() => undefined} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.queryByTestId('lp-wax-pressing')).toBeNull();
    view.rerender(<LessonPath map={after} due={0} onFocus={() => undefined} />);
    // Its bar fills and goes gold, and it is sealed, once, kept on the phone for next time.
    expect(screen.getAllByTestId('lp-bar-gold').length).toBeGreaterThan(0);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const d = screen.getByRole('button', { name: /^Topic d, (?!you)/ });
    // Its first apple pressed into the seal.
    expect(within(d).getByTestId('lp-wax-1')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('hevalo_stamped_v1:c-return') ?? '[]')).toContain('s:d');
    // The chapter's story is won with it.
    expect(button('Hamo’s story: Malbat')).toBeTruthy();
    cleanup();
    patchReactNativeWeb({ reduceMotion: true });
  });

  it('presses a sealed topic’s new apple into its seal on coming back from the lesson that made its next round whole', async () => {
    client();
    patchReactNativeWeb({ reduceMotion: false });
    const before = levelled('c-again');
    const after = levelled('c-again');
    // Topic c had two rounds, sealed on this phone; its third round is completed since.
    before.units[1]!.skills[0] = { ...before.units[1]!.skills[0]!, lessons: [lesson('c1', 'Lesson c1', true, 3), lesson('c2', 'Lesson c2', true, 2)] };
    localStorage.setItem('hevalo_stamped_v1:c-again', JSON.stringify(['s:a', 's:b', 's:c']));
    const view = renderWithProviders(<LessonPath map={before} due={0} onFocus={() => undefined} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const c = () => screen.getByRole('button', { name: /^Topic c, / });
    expect(within(c()).getByTestId('lp-wax-2')).toBeTruthy();
    view.rerender(<LessonPath map={after} due={0} onFocus={() => undefined} />);
    // The stamp comes back and presses the third apple in, and a flame passes over its wax, leaving it gold.
    await waitFor(() => expect(within(c()).getByTestId('lp-wax-3-gold')).toBeTruthy(), { timeout: 4000 });
    expect(within(c()).getByTestId('lp-wax-fire')).toBeTruthy();
    cleanup();
    patchReactNativeWeb({ reduceMotion: true });
  });
});
