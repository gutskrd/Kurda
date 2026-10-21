import { useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { BURST, burstPlan, celebrationPlan } from '@kurda/shared';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useCelebrationMoment } from '../lib/motion';

/**
 * The moment something is earned: a new division or tier, a placement
 * finished, a new league, a badge (contract 4 §U) — and, inline, a lesson
 * finished.
 *
 * The same short sequence everywhere (shared celebration.ts, drawn by
 * styles/motion.css): the art springs in, a ring of its colour widens once
 * behind it, a light handful of flecks in its colours is thrown out and falls
 * away, it is felt once as it lands (lib/haptics.ts, on a touch screen that
 * can), and then the words fade in. It is over in about a second and a half;
 * a click or a tap on it skips to the end, and after that nothing moves while
 * it is read. Under reduced motion it simply appears. A dialog, so focus goes
 * to it and Escape closes it, and what it says is read out.
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
  flecks = BURST.badge,
  seed = 7,
  colours,
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
  /** how many flecks are thrown */
  flecks?: number;
  /** keeps the same moment looking the same */
  seed?: number;
  /** the light and strong colour, for a moment whose tone has no class of its own (a league) */
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
  flecks: number;
  seed: number;
  colours?: readonly [string, string];
}): React.JSX.Element {
  const moment = useCelebrationMoment();
  const style = colours ? ({ '--t-hi': colours[0], '--t-mid': colours[1] } as CSSProperties) : undefined;
  return (
    // a click anywhere on it while it plays skips to the end; the button is always there for a keyboard
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
      </div>
    </div>
  );
}

/**
 * The art on its stage: the glow behind it, the ring, the flecks — each fleck
 * told where it flies by custom properties, so the whole burst is one
 * stylesheet animation per fleck and costs the page nothing once it is over.
 * Inside an element with `.celebrate` and a `tone-*` (the colours) and
 * `is-playing` / `is-done` (whether it still moves).
 */
const FULL = celebrationPlan(false);

export function CelebrationArt({
  children,
  flecks,
  seed,
  reach,
}: {
  children: React.ReactNode;
  flecks: number;
  seed: number;
  reach: number;
}): React.JSX.Element {
  const plan = useMemo(() => burstPlan(flecks, seed, 3, reach), [flecks, seed, reach]);
  // each fleck's slice of the burst, in the burst's own time (shared celebration.ts)
  const { burstMs, burstDelayMs } = FULL;
  return (
    <div className="celebrate-art">
      <span className="celebrate-glow" aria-hidden="true" />
      <span className="celebrate-ring" aria-hidden="true" />
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
                animationDelay: `${burstDelayMs + Math.round(f.start * burstMs)}ms`,
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
