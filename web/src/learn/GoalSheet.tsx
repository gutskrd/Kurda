import { useId } from 'react';
import { GOAL_OPTIONS, type DailyGoalStatus, type GoalOption } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Sheet } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useOptimistic } from '../lib/optimistic';

/** Today's goal as a ring, filled by what is earned and gold once met. */
export function GoalRing({ share, met, size = 28 }: { share: number; met: boolean; size?: number }): React.JSX.Element {
  // The stroke stays 4 units wide at any size, so the small ring in the strip keeps its weight.
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const half = size / 2;
  return (
    <svg className={`learn-strip-ring${met ? ' is-met' : ''}`} width={size} height={size} viewBox={`${-half} ${-half} ${size} ${size}`} aria-hidden="true" focusable="false">
      <circle className="learn-strip-ring-track" r={r} />
      {share > 0 && <circle className="learn-strip-ring-fill" r={r} strokeDasharray={`${c * Math.min(1, share)} ${c}`} />}
    </svg>
  );
}

/**
 * Today's goal, opened from Learn's strip: the ring with what is earned, and the goal to choose (10, 20, 30 or 50 XP a
 * day) as a segmented control over real radios. A choice shows at once and is saved behind it; a refusal puts the saved
 * goal back with a notice. A higher goal counts from tomorrow, so today's ring keeps its target until then.
 */
export function GoalSheet({
  status,
  open,
  onClose,
  onSaved,
}: {
  status: DailyGoalStatus;
  open: boolean;
  onClose: () => void;
  /** The server's status after a change, which the strip's ring then shows. */
  onSaved: (status: DailyGoalStatus) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const name = `goal${useId()}`;
  const number = (n: number): string => n.toLocaleString(locale);
  const [goal, setGoal] = useOptimistic<GoalOption, DailyGoalStatus>(status.goal, (wanted) => client.put<DailyGoalStatus>('/me/daily-goal', { goal: wanted }), {
    fromAnswer: (answer) => answer.goal,
    onSaved: (answer) => onSaved(answer),
  });
  const target = status.effectiveGoal || status.goal;
  return (
    <Sheet open={open} onClose={onClose} label={t('learn.today.title')} className="goal-sheet">
      <h2 className="goal-sheet-title">{t('learn.today.title')}</h2>
      <div className="goal-sheet-now">
        <GoalRing share={status.progress} met={status.completed} size={56} />
        <p className="goal-sheet-words">
          {status.completed ? t('learn.today.done') : t('learn.today.goal', { xp: number(status.earnedXp), goal: number(target) })}
        </p>
      </div>
      <fieldset className="goal-picker">
        <legend className="goal-picker-legend">{t('learn.today.goalSetting', { xp: number(goal) })}</legend>
        <div className="goal-picker-options">
          {GOAL_OPTIONS.map((option) => (
            <label key={option} className={`seg-btn goal-picker-option${option === goal ? ' is-active' : ''}`}>
              <input type="radio" name={name} value={option} checked={option === goal} onChange={() => setGoal(option)} />
              <span aria-hidden="true">{number(option)}</span>
              <span className="sr-only">{t('learn.today.goalOption', { xp: number(option) })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="goal-sheet-note">{t('learn.today.goalNote')}</p>
    </Sheet>
  );
}
