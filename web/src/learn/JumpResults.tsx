import { useEffect, useRef } from 'react';
import { HevaloWindow } from '../characters/HevaloWindow';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import { haptic } from '../lib/haptics';
import { playLessonSound } from '../lib/sounds';
import type { JumpOutcome, JumpTestStart } from './types';

/**
 * How a jump-ahead test went, as the server graded it. A pass opens the chapter and Hevalo cheers; a miss says the score
 * plainly, never as a failure, with Try again while today's tries last. The heading takes focus so it is read at once.
 */
export function JumpResults({
  test,
  outcome,
  onPath,
  onAgain,
}: {
  test: JumpTestStart['jump'];
  /** Null only if the server sent none, which it always does for a test. */
  outcome: JumpOutcome | null;
  /** Back to the path, which shows what the test opened. */
  onPath: () => void;
  /** Another test at the same chapter. */
  onAgain: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const passed = outcome?.passed === true;
  const number = (v: number): string => v.toLocaleString(locale);
  const n = number(test.unitNumber);
  const correct = number(outcome?.correct ?? 0);
  const total = number(outcome?.total ?? 0);
  const needed = number(Math.max(0, (outcome?.total ?? 0) - (outcome?.mistakesAllowed ?? 0)));

  // Once, when the result opens.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (!passed) return;
    haptic('celebrate');
    playLessonSound('complete');
  }, [passed]);

  return (
    <div className="jump-end" data-testid="jump-results">
      <HevaloWindow size={200} reaction={passed ? 'cheer' : 'hmm'} />
      <h1 className="jump-end-title" tabIndex={-1} ref={heading}>
        {passed ? t('coursemap.jump.passed', { n }) : t('coursemap.jump.notYet')}
      </h1>
      <p className="jump-end-line">
        {passed ? t('coursemap.jump.passedBody', { correct, total }) : t('coursemap.jump.notYetBody', { correct, total, n, needed })}
      </p>
      {!passed && (
        <p className="jump-end-line">{test.triesLeft > 0 ? t('coursemap.jump.triesLeft', { count: number(test.triesLeft) }) : t('coursemap.jump.noTries')}</p>
      )}
      <div className="jump-end-actions">
        <Button size="lg" block onClick={onPath}>
          {passed ? t('coursemap.jump.go', { n }) : t('coursemap.jump.keepLearning')}
        </Button>
        {!passed && test.triesLeft > 0 && (
          <Button variant="secondary" size="lg" block onClick={onAgain}>
            {t('coursemap.jump.tryAgain')}
          </Button>
        )}
      </div>
    </div>
  );
}
