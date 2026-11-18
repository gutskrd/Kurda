/**
 * Fetches the lesson's code early: it is the heaviest lazily loaded page, and a learner who opens a stop's card is one
 * press from it. The same module the route imports, so the browser fetches it once; asked once per tab, and a failure
 * is forgotten so the next card retries.
 */
let asked = false;

export function preloadLesson(): void {
  if (asked) return;
  asked = true;
  void import('../pages/Lesson').catch(() => {
    asked = false;
  });
}
