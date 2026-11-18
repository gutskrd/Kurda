import { PATH_JUMP, type PathUnit } from '@kurda/shared';
import { LinkButton } from '../components/Button';
import { CheckIcon, HelpIcon, NextIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { SkillNode } from './types';

/**
 * The "Jump here?" offer on the path: what a jump does, the test's length and pass mark (shared `PATH_JUMP`), and the way
 * into the test (JumpTest.tsx), which comes back to `from`.
 */
export function JumpSheet({
  unit,
  courseId,
  from,
  onClose,
}: {
  unit: PathUnit<SkillNode> | null;
  courseId: string;
  from: string;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => v.toLocaleString(locale);
  const n = unit ? number(unit.number) : '';
  return (
    <Sheet open={unit !== null} onClose={onClose} label={unit ? t('coursemap.jump.title', { n }) : ''} className="lp-jump-sheet">
      {unit && (
        <div className={`lp-jump-offer lp-tone-${unit.tone}`}>
          <div className="lp-jump-head">
            <span className="lp-jump-badge" aria-hidden="true">
              <NextIcon size={24} />
            </span>
            <div>
              <p className="lp-pop-eyebrow">
                {t('coursemap.unit', { n })} · {unit.title}
              </p>
              <h2 className="lp-guide-title">{t('coursemap.jump.title', { n })}</h2>
            </div>
          </div>
          <p className="lp-jump-line">{t('coursemap.jump.body', { n })}</p>
          <ul className="lp-jump-facts">
            <li>
              <HelpIcon size={18} />
              {t('coursemap.jump.questions', { count: number(PATH_JUMP.questions) })}
            </li>
            <li>
              <CheckIcon size={18} />
              {t('coursemap.jump.mistakes', { count: number(PATH_JUMP.maxMistakes) })}
            </li>
          </ul>
          <LinkButton
            to={`/app/learn/jump/${encodeURIComponent(courseId)}/${encodeURIComponent(unit.unitId)}`}
            state={{ from }}
            size="lg"
            block
          >
            {t('coursemap.jump.start')}
          </LinkButton>
        </div>
      )}
    </Sheet>
  );
}
