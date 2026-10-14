import { CheckIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';

/**
 * The weekly goal as a ring (contract 4 §L3, §U): the XP that counts for the
 * league this week against the goal, closing as it fills and turning gold
 * with a tick once it is met — met, you are safe, and that is said in words
 * beside it too. One drawing for the league, personal mode and Home.
 *
 * Nothing about it counts down: it only ever fills.
 */
export function GoalRing({ xp, goal, size = 96, label = true }: { xp: number; goal: number; size?: number; label?: boolean }): React.JSX.Element {
  const t = useT();
  const met = xp >= goal;
  const fraction = goal > 0 ? Math.max(0, Math.min(1, xp / goal)) : 1;
  const stroke = Math.max(5, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={`goal-ring${met ? ' is-met' : ''}`}
      role="img"
      aria-label={t('leagues.goalRing', { xp: xp.toLocaleString(), goal: goal.toLocaleString() })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="goal-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="goal-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {(label || met) && (
        <span className="goal-ring-text" aria-hidden="true">
          {met && !label ? (
            <CheckIcon size={Math.round(size / 2.6)} weight="bold" />
          ) : (
            <>
              {met && <CheckIcon size={Math.round(size / 6)} weight="bold" />}
              <span className="goal-ring-num">{xp.toLocaleString()}</span>
              <span className="goal-ring-of">{t('leagues.goalOf', { goal: goal.toLocaleString() })}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
