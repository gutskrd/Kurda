import type { ReactNode } from 'react';
import { PersonGlyph } from '../components/icons';
import { useAvatarSrc } from '../art/overrides';

/**
 * One player in a head-to-head game: face, name, status and, for an opponent whose board is hidden, a progress bar.
 * The front page's picture of a battle uses the same chip.
 */
export function PlayerChip({
  name,
  status,
  avatarUrl,
  progress,
  done = false,
  lazy = false,
  action,
}: {
  name: string;
  status: string;
  /** `null` draws the silhouette, since a battle does not share an opponent's face. */
  avatarUrl?: string | null;
  /** From 0 to 1. */
  progress?: number;
  /** Solved, so the chip takes the success colour. */
  done?: boolean;
  lazy?: boolean;
  /** An action at the chip's end, such as the ⋯ that reports the player. */
  action?: ReactNode;
}): React.JSX.Element {
  const face = useAvatarSrc(avatarUrl);
  return (
    <div className={`player${done ? ' is-done' : ''}`}>
      <span className="player-face" aria-hidden="true">
        {face ? (
          <img src={face} alt="" width={34} height={34} loading={lazy ? 'lazy' : undefined} decoding="async" />
        ) : (
          <PersonGlyph size={18} />
        )}
      </span>
      <span className="player-text">
        <span className="player-name">{name}</span>
        <span className="player-status">{status}</span>
      </span>
      {action}
      {progress !== undefined && (
        <span className="player-meter" aria-hidden="true">
          {/* A full-width fill moved along its track by `--p` (styles/motion.css). */}
          <span style={{ '--p': Math.max(0, Math.min(1, progress)) } as React.CSSProperties} />
        </span>
      )}
    </div>
  );
}
