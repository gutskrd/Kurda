/** The pages played with nothing else on the screen (layouts/FocusLayout.tsx): a lesson and a review. */
const FOCUSED = /^\/app\/learn\/(lesson|review)(\/|$)/;

/**
 * Whether a page is one of them: what the invite banner and the rating box
 * ask before they show, so whatever arrives during a lesson waits for the
 * page after it.
 */
export function isFocusedPath(pathname: string): boolean {
  return FOCUSED.test(pathname);
}
