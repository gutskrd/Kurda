/**
 * Which group of Learn somebody was last on: the lessons, the stories, or the
 * games.
 *
 * Learn is one place with three views, and the tab that opens it goes back to
 * the view you left — somebody who plays every evening should not have to
 * switch to Games every time, somebody reading a story a night should land
 * among the stories, and somebody working through a course should not be
 * dropped into either. Lessons until a choice has been made.
 *
 * Each view keeps its own address (/app/learn, /app/learn/stories and
 * /app/games), so a link, a bookmark or the old Play shortcut still lands on
 * the view it names; this only decides where the tab goes when nothing named
 * one.
 */
export type LearnView = 'lessons' | 'stories' | 'games';

/** The three groups, in the order the switch shows them. */
export const LEARN_VIEWS: readonly LearnView[] = ['lessons', 'stories', 'games'];

export function isLearnView(v: unknown): v is LearnView {
  return (LEARN_VIEWS as readonly unknown[]).includes(v);
}

const KEY = 'hevalo_learn_view';

export const LEARN_PATHS: Record<LearnView, string> = {
  lessons: '/app/learn',
  stories: '/app/learn/stories',
  games: '/app/games',
};

export function readLearnView(): LearnView {
  try {
    const stored = localStorage.getItem(KEY);
    return isLearnView(stored) ? stored : 'lessons';
  } catch {
    return 'lessons';
  }
}

export function rememberLearnView(view: LearnView): void {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // site data blocked: the tab opens Lessons, which is still a working answer
  }
}

/** Where the Learn tab goes. */
export function learnPath(): string {
  return LEARN_PATHS[readLearnView()];
}
