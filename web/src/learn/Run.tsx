import { useEffect, useRef } from 'react';
import { RUN_SHOWN_FROM } from '@kurda/shared';
import { Fire } from '../components/Fire';
import { useT } from '../i18n/I18nProvider';

/**
 * Right answers in a row, over the lesson's bar while the run lasts (from
 * `RUN_SHOWN_FROM`): it pops each time it grows — the player gives it the run
 * as its key, so a new number is a new label — and is gone with a miss.
 */
export function RunLabel({ run }: { run: number }): React.JSX.Element | null {
  const t = useT();
  if (run < RUN_SHOWN_FROM) return null;
  return (
    <span className="lesson-run-label">
      <Fire size={16} />
      {t('lesson.run.label', { count: run })}
    </span>
  );
}

/** How long a milestone ("10 in a row!") has the screen after Continue, unless a tap or a key goes on sooner. */
export const RUN_MOMENT_MS = 1000;

/**
 * A run reaching a milestone (`runMilestone`), named across the whole screen
 * for a moment after Continue, before the next exercise: it springs in, or
 * fades in under reduced motion. Any tap or key goes on at once, and that key
 * does nothing else. Decorative: the verdict above it already said so in
 * words.
 */
export function RunMoment({ count, onDone }: { count: number; onDone: () => void }): React.JSX.Element {
  const t = useT();
  const over = useRef(false);
  const end = useRef(onDone);
  end.current = onDone;
  // once, whichever comes first: the time, a tap or a key
  const finish = useRef((): void => {
    if (over.current) return;
    over.current = true;
    end.current();
  });
  useEffect(() => {
    const go = finish.current;
    const id = window.setTimeout(go, RUN_MOMENT_MS);
    // before anything else on the page hears it: the key that skips is not also an answer or a Continue
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      go();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
  return (
    <div className="lesson-run-moment" aria-hidden="true" onClick={() => finish.current()}>
      <span className="lesson-run-moment-words">
        <Fire size={104} />
        {t('lesson.run.milestone', { count })}
      </span>
    </div>
  );
}
