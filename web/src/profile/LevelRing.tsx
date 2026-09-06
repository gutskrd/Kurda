/** How far round the ring goes; the rest is the unfilled track. */
const RING = { size: 100, stroke: 6 } as const;

/**
 * A ring of progress, drawn to sit around an avatar.
 *
 * A stroked SVG circle dashed to an exact fraction of its own circumference,
 * which is what "42% of the way" means. Not a conic-gradient border: that needs
 * a second element to mask the middle, and does not stay circular under scaling.
 *
 * The viewBox is fixed and the element is sized by CSS, so the same component
 * draws the ring on the nav bar and anywhere else it is wanted without a size
 * prop to keep in step with the avatar next to it.
 */
export function LevelRing({ progress }: { progress: number }): React.JSX.Element {
  const r = (RING.size - RING.stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, progress)) * circumference;

  return (
    <svg className="level-ring" viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden focusable="false">
      <circle className="level-ring-track" cx={RING.size / 2} cy={RING.size / 2} r={r} strokeWidth={RING.stroke} />
      <circle
        className="level-ring-fill"
        cx={RING.size / 2}
        cy={RING.size / 2}
        r={r}
        strokeWidth={RING.stroke}
        strokeDasharray={`${filled} ${circumference - filled}`}
        // start at twelve o'clock rather than three, which is where a ring reads
        // as "filling up" instead of "rotating"
        transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
      />
    </svg>
  );
}
