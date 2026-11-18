/** Whether the page is in view; true without a document (tests, workers). */
export function pageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * `setInterval` for a poll that skips ticks while the tab is hidden. Coming back asks once at once, but only if a tick
 * was missed. Returns the stop, for an effect's cleanup.
 */
export function pollWhileVisible(tick: () => void, everyMs: number): () => void {
  let missed = false;
  const timer = setInterval(() => {
    if (pageVisible()) tick();
    else missed = true;
  }, everyMs);
  const onVisibility = (): void => {
    if (!missed || !pageVisible()) return;
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
