/**
 * The Learn group last visited (lessons, stories or games), so the Learn tab returns to it; Lessons until a choice is
 * made. Each group keeps its own address, so links and bookmarks still land where they name.
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
    // Site data blocked: the tab opens Lessons, which still works.
  }
}

/** Where the Learn tab goes. */
export function learnPath(): string {
  return LEARN_PATHS[readLearnView()];
}
