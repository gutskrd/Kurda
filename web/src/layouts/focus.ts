/** Pages shown alone (layouts/FocusLayout.tsx): a lesson, a review, and the route to a new account’s first lesson. */
const FOCUSED = /^\/app\/learn\/(lesson|review|next)(\/|$)/;

/** Whether a page is focused, so the invite banner and rating box wait until the learner leaves it. */
export function isFocusedPath(pathname: string): boolean {
  return FOCUSED.test(pathname);
}
