/** How far round the ring goes; the rest is the unfilled track. */
const RING = { size: 100, stroke: 6 } as const;

/**
 * A progress ring around an avatar: a stroked SVG circle dashed to the exact fraction, which stays round when scaled.
 * The viewBox is fixed and CSS sets the size, so no size prop has to match the avatar.
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
        // Starts at twelve o’clock so the ring reads as filling up.
        transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
      />
    </svg>
  );
}
