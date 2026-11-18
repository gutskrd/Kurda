/**
 * A new account, or a guest who has just pressed Start learning, opens its first lesson once the signed-in screens
 * are up, as the website sends a new account to /app/learn/next. Set where the account comes into being, taken once
 * by the app root.
 */
let waiting = false;

export function openFirstLessonNext(): void {
  waiting = true;
}

/** Whether the first lesson is wanted now; asking clears it, so it opens once. */
export function takeFirstLesson(): boolean {
  const was = waiting;
  waiting = false;
  return was;
}
