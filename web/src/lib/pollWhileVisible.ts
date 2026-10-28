/** Whether the page is in view; true where there is no document to ask (tests without one, a worker). */
function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * `setInterval` for a poll, which does not ask while nobody can see the answer.
 *
 * A tab left open behind another one used to go on asking for the same things
 * at the same rate for as long as the browser stayed open — the chat lists, an
 * open thread, the unread count, the presence beat — and a browser rarely closes
 * a tab, so most of what the API answered for this page was read by nobody.
 * Each of those asks is a request to the API and, because the API is another
 * origin, often its preflight as well.
 *
 * So a tick while the tab is hidden is skipped, and remembered: coming back
 * into view asks once at once, but only if a tick was missed, so switching
 * away and straight back costs nothing. Returns the stop, for an effect's
 * cleanup.
 */
export function pollWhileVisible(tick: () => void, everyMs: number): () => void {
  let missed = false;
  const timer = setInterval(() => {
    if (visible()) tick();
    else missed = true;
  }, everyMs);
  const onVisibility = (): void => {
    if (!missed || !visible()) return;
    missed = false;
    tick();
  };
  const watching = typeof document !== 'undefined';
  if (watching) document.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearInterval(timer);
    if (watching) document.removeEventListener('visibilitychange', onVisibility);
  };
}
