/**
 * Which half of Learn somebody was last on: the lessons, or the games.
 *
 * Learn is one place with two views, and the tab that opens it goes back to
 * the view you left — somebody who plays every evening should not have to
 * switch to Games every time, and somebody working through a course should
 * not be dropped into the games. Lessons until a choice has been made.
 *
 * Each view keeps its own address (/app/learn and /app/games), so a link,
 * a bookmark or the old Play shortcut still lands on the view it names; this
 * only decides where the tab goes when nothing named one.
 */
export type LearnView = 'lessons' | 'games';

const KEY = 'hevalo_learn_view';

export const LEARN_PATHS: Record<LearnView, string> = {
  lessons: '/app/learn',
  games: '/app/games',
};

export function readLearnView(): LearnView {
  try {
    return localStorage.getItem(KEY) === 'games' ? 'games' : 'lessons';
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
