import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';

/**
 * The moment something is earned: a new division or tier, a placement
 * finished, a badge (contract 4 §U).
 *
 * The art rises out of its own light, a few flecks of colour drift down —
 * kilim diamonds in the tier's colours, not a burst of party confetti — and
 * one button carries on. Under reduced motion it simply fades in. A dialog,
 * so focus goes to it and Escape closes it, and what it says is read out.
 *
 * Celebrations queue rather than stack: a game's result holds the badge
 * celebrations back (`useCelebrationHold`) until its own moment is over, so a
 * division-up is never covered by the badge it also earned.
 */
export function Celebration({
  open,
  label,
  art,
  kicker,
  title,
  body,
  tone,
  action,
  onClose,
  extra,
}: {
  open: boolean;
  /** the dialog's accessible name */
  label: string;
  art: React.ReactNode;
  kicker?: string;
  title: string;
  body?: string | null;
  /** the colour family the light and the flecks take: a rank tier, a badge tier, a league */
  tone: string;
  /** the button's words */
  action: string;
  onClose: () => void;
  extra?: React.ReactNode;
}): React.JSX.Element | null {
  const flecks = useMemo(() => fleckField(14), []);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} label={label}>
      <div className={`celebrate tone-${tone}`}>
        <div className="celebrate-stage" aria-hidden="true">
          <span className="celebrate-rays" />
          <span className="celebrate-glow" />
          {flecks.map((f, i) => (
            <span
              key={i}
              className="celebrate-fleck"
              style={{ left: `${f.x}%`, animationDelay: `${f.delay}ms`, animationDuration: `${f.duration}ms`, width: f.size, height: f.size }}
            />
          ))}
        </div>
        <div className="celebrate-art">{art}</div>
        {kicker && <p className="celebrate-kicker">{kicker}</p>}
        <h2 className="celebrate-title">{title}</h2>
        {body && <p className="celebrate-body">{body}</p>}
        {extra}
        <Button size="lg" onClick={onClose} className="celebrate-go">
          {action}
        </Button>
      </div>
    </Modal>
  );
}

/** Where the flecks fall from: spread across the top, unhurried, never the same twice in a row. */
function fleckField(count: number): Array<{ x: number; delay: number; duration: number; size: number }> {
  return Array.from({ length: count }, (_, i) => ({
    x: 6 + ((i * 37) % 88),
    delay: (i * 173) % 1400,
    duration: 2600 + ((i * 251) % 1600),
    size: 6 + ((i * 3) % 5),
  }));
}

// ---- the queue ----------------------------------------------------------------------

const holds = new Set<symbol>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** While `active`, badge celebrations wait (a game's own result is still being shown). */
export function useCelebrationHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const token = Symbol('hold');
    holds.add(token);
    notify();
    return () => {
      holds.delete(token);
      notify();
    };
  }, [active]);
}

/** Whether anything is holding celebrations back right now. */
export function useCelebrationsHeld(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => holds.size > 0,
    () => false,
  );
}
