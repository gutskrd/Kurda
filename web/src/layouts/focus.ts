/**
 * The pages played with nothing else on the screen (layouts/FocusLayout.tsx):
 * a lesson, a review, and the way to a new account's first lesson, which shows
 * the lesson's frame until it has found the lesson.
 */
const FOCUSED = /^\/app\/learn\/(lesson|review|next)(\/|$)/;

/**
 * Whether a page is one of them: what the invite banner and the rating box
 * ask before they show, so whatever arrives during a lesson waits for the
 * page after it.
 */
export function isFocusedPath(pathname: string): boolean {
  return FOCUSED.test(pathname);
}
