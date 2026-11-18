import { useEffect, useRef, useState } from 'react';
import { RUN_SHOWN_FROM, fireSizeToFit, runFireLevel, runMoment } from '@kurda/shared';
import { Fire } from '../components/Fire';
import { useT } from '../i18n/I18nProvider';

/**
 * Right answers in a row over the lesson's bar (from `RUN_SHOWN_FROM`): it pops as it grows (the run is its key), goes
 * with a miss, and its fire grows with it (`runFireLevel`).
 */
export function RunLabel({ run }: { run: number }): React.JSX.Element | null {
  const t = useT();
  if (run < RUN_SHOWN_FROM) return null;
  return (
    <span className="lesson-run-label">
      <Fire size={16} level={runFireLevel(run)} />
      {t('lesson.run.label', { count: run })}
    </span>
  );
}

/** A milestone fire's framed size: the biggest a run grows (the blaze) about 200 high, so longer runs show bigger fires. */
const RUN_FIRE = fireSizeToFit('blaze', 200, 200);

/**
 * A run milestone (`runMilestone`) named across the screen after Continue: it springs in (fades under reduced motion),
 * grows its fire into a new stage where reached (shared `runMoment`), and any tap or key dismisses it without doing
 * anything else. Decorative; the verdict already said it.
 */
export function RunMoment({ count, onDone }: { count: number; onDone: () => void }): React.JSX.Element {
  const t = useT();
  const [fire] = useState(() => runMoment(count));
  const over = useRef(false);
  const end = useRef(onDone);
  end.current = onDone;
  // Once, whichever comes first: the time, a tap or a key.
  const finish = useRef((): void => {
    if (over.current) return;
    over.current = true;
    end.current();
  });
  useEffect(() => {
    const go = finish.current;
    const id = window.setTimeout(go, fire.ms);
    // Before anything else hears it, so the skipping key is not also an answer or a Continue.
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
  }, [fire]);
  return (
    <div className="lesson-run-moment" aria-hidden="true" onClick={() => finish.current()}>
      <span className="lesson-run-moment-words">
        <Fire size={RUN_FIRE} level={fire.level} from={fire.from} framed />
        {t('lesson.run.milestone', { count })}
      </span>
    </div>
  );
}
