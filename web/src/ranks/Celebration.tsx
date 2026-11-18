import { useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { BURST, burstPlan, celebrationPlan } from '@kurda/shared';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useCelebrationMoment } from '../lib/motion';

/**
 * The celebration for something earned (a division, tier, placement, league or badge, and inline a finished lesson).
 * One short sequence everywhere (shared celebration.ts, styles/motion.css): the art springs in, a ring widens, flecks
 * burst and fall, one haptic as it lands (lib/haptics.ts), then the words fade in. A click skips to the end; under
 * Reduce Motion it simply appears. As a dialog it takes focus, Escape closes it and its text is announced.
 *
 * Celebrations queue: a game's result holds badge celebrations back (`useCelebrationHold`) until its own moment ends.
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
  below,
  flecks = BURST.badge,
  seed = 7,
  colours,
}: {
  open: boolean;
  /** The dialog's accessible name. */
  label: string;
  art: React.ReactNode;
  kicker?: string;
  title: string;
  body?: string | null;
  /** The colour family of the light and flecks: a rank tier, a badge tier or a league. */
  tone: string;
  /** The button's label. */
  action: string;
  onClose: () => void;
  extra?: React.ReactNode;
  /** Something quieter under the main button, such as a win's Share. */
  below?: React.ReactNode;
  /** How many flecks are thrown. */
  flecks?: number;
  /** Keeps the same moment looking the same. */
  seed?: number;
  /** The light and strong colours, for a tone without its own class, such as a league. */
  colours?: readonly [string, string];
}): React.JSX.Element | null {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} label={label}>
      <CelebrationBody
        art={art}
        kicker={kicker}
        title={title}
        body={body}
        tone={tone}
        action={action}
        onClose={onClose}
        extra={extra}
        below={below}
        flecks={flecks}
        seed={seed}
        colours={colours}
      />
    </Modal>
  );
}

function CelebrationBody({
  art,
  kicker,
  title,
  body,
  tone,
  action,
  onClose,
  extra,
  below,
  flecks,
  seed,
  colours,
}: {
  art: React.ReactNode;
  kicker?: string;
  title: string;
  body?: string | null;
  tone: string;
  action: string;
  onClose: () => void;
  extra?: React.ReactNode;
  below?: React.ReactNode;
  flecks: number;
  seed: number;
  colours?: readonly [string, string];
}): React.JSX.Element {
  const moment = useCelebrationMoment();
  const style = colours ? ({ '--t-hi': colours[0], '--t-mid': colours[1] } as CSSProperties) : undefined;
  return (
    // A click anywhere while it plays skips to the end; the button is always there for the keyboard.
    <div
      className={`celebrate tone-${tone} ${moment.playing ? 'is-playing' : 'is-done'}`}
      style={style}
      onClick={moment.playing ? moment.skip : undefined}
    >
      <CelebrationArt flecks={flecks} seed={seed} reach={150}>
        {art}
      </CelebrationArt>
      <div className="celebrate-details">
        {kicker && <p className="celebrate-kicker">{kicker}</p>}
        <h2 className="celebrate-title">{title}</h2>
        {body && <p className="celebrate-body">{body}</p>}
        {extra}
        <Button size="lg" onClick={onClose} className="celebrate-go">
          {action}
        </Button>
        {below}
      </div>
    </div>
  );
}

/**
 * The art on its stage with the glow, ring and flecks; each fleck's path is set by custom properties, so the burst is
 * one CSS animation per fleck. Placed inside `.celebrate` with a `tone-*` class and `is-playing` or `is-done`.
 */
const FULL = celebrationPlan(false);

export function CelebrationArt({
  children,
  flecks,
  seed,
  reach,
  delayMs = 0,
  still = false,
}: {
  children: React.ReactNode;
  flecks: number;
  seed: number;
  reach: number;
  /** How long after it appears the flecks are thrown, for a moment that opens on something else first. */
  delayMs?: number;
  /** No ring or flecks under Reduce Motion; the stylesheet hides them if it is turned on later. */
  still?: boolean;
}): React.JSX.Element {
  const plan = useMemo(() => (still ? [] : burstPlan(flecks, seed, 3, reach)), [still, flecks, seed, reach]);
  // Each fleck's slice of the burst, in the burst's own time (shared celebration.ts).
  const { burstMs, burstDelayMs } = FULL;
  return (
    <div className="celebrate-art">
      <span className="celebrate-glow" aria-hidden="true" />
      {!still && <span className="celebrate-ring" aria-hidden="true" />}
      <span className="celebrate-burst" aria-hidden="true">
        {plan.map((f, i) => (
          <span
            key={i}
            className={`celebrate-fleck c${f.colour}`}
            style={
              {
                '--dx': `${f.dx}px`,
                '--dy': `${f.dy}px`,
                '--fall': `${f.fall}px`,
                '--spin': `${f.spin}deg`,
                width: f.w,
                height: f.h,
                animationDelay: `${delayMs + burstDelayMs + Math.round(f.start * burstMs)}ms`,
                animationDuration: `${Math.round((f.end - f.start) * burstMs)}ms`,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <span className="celebrate-art-inner">{children}</span>
    </div>
  );
}

// ---- The queue ----------------------------------------------------------------------

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
