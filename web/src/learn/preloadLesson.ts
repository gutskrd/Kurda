/**
 * The lesson's code, asked for before it is needed.
 *
 * Every page is loaded on demand (App.tsx), and the lesson is the heaviest of
 * them: the player, every kind of exercise, the results. A learner who has
 * opened a stop's card on the path is one press from a lesson, so the card
 * opening is when its code is fetched — by the time Start is pressed it is
 * usually already here, and the press opens the lesson rather than a wait.
 *
 * It is the same module the route itself imports, so the browser fetches it
 * once and the route finds it there. Asked once per tab; a failure (offline)
 * is forgotten, so the next card tries again and the route's own import still
 * reports the problem if it lasts.
 */
let asked = false;

export function preloadLesson(): void {
  if (asked) return;
  asked = true;
  void import('../pages/Lesson').catch(() => {
    asked = false;
  });
}
