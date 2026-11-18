import { useEffect, useRef, useState } from 'react';
import { ShareIcon } from '../components/icons';
import { APP_NAME, useT } from '../i18n/I18nProvider';
import './share.css';

/** What became of a share: sent to the device's sheet, copied instead, dismissed, or neither was possible. */
type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed';

/**
 * Shares a message through the device's share sheet, or copies it where there is none. The link stays inside the
 * text, since some apps drop or move a separate link.
 */
export async function shareOut(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: APP_NAME, text });
      return 'shared';
    } catch (e) {
      // Closing the sheet is a choice, so nothing more is done; a sheet that would not open falls back to copying.
      if (e instanceof DOMException && e.name === 'AbortError') return 'dismissed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** How long the button says "Copied" before it is itself again. */
const COPIED_MS = 2000;

/**
 * A quiet Share button for a win, such as a finished lesson, a streak milestone, a badge, a good league week or the
 * word game's result. It never prompts or rewards; where it copies instead of sharing, it says "Copied" for a moment.
 */
export function ShareWin({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function share(): Promise<void> {
    if ((await shareOut(text)) !== 'copied') return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <button type="button" className={`btn btn-secondary share-win${copied ? ' is-done' : ''}${className ? ` ${className}` : ''}`} onClick={() => void share()}>
      <ShareIcon size={18} />
      <span aria-live="polite">{copied ? t('share.copied') : t('share.title')}</span>
    </button>
  );
}
