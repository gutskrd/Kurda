import { onTestFinished, vi } from 'vitest';
import { onNotice } from '../theme/notice';

/** Records the short notices (theme/notice.ts) raised during the current test, such as a refused change said. */
export function watchNotices() {
  const said = vi.fn<(text: string) => void>();
  onTestFinished(onNotice(said));
  return said;
}
