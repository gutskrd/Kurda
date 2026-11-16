import { useEffect, useRef, useState } from 'react';
import { ShareIcon } from '../components/icons';
import { APP_NAME, useT } from '../i18n/I18nProvider';
import './share.css';

/** What became of a share: handed to the device's sheet, copied instead, put away by the person, or neither could be done. */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed';

/**
 * Hand a message to whatever the device shares with: its own sheet where it
 * has one, and the clipboard where it has not (a desktop). The whole message
 * goes as the text, its address last: handed over beside the words, a link is
 * put wherever the receiving app likes, and dropped by some.
 */
export async function shareOut(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: APP_NAME, text });
      return 'shared';
    } catch (e) {
      // closing the sheet is a choice, and nothing more is done; a sheet that would not open leaves copying
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
 * "Share", on a moment worth showing somebody: a lesson finished, a streak's
 * big day, a badge, a league week that went well, the word game's result.
 *
 * It is offered and never pushed. One quiet button beside the way on, which
 * stays the main thing on the screen; it holds nothing back, earns nothing,
 * counts nothing, and is not asked a second time. Where the device has no
 * sheet to hand the message to, the message is copied, and the button says
 * so for a moment.
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
