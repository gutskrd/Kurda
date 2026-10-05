import { PersonGlyph } from '../components/icons';

/**
 * One player in a head-to-head game: face, name, how they are doing, and — for
 * an opponent whose board you cannot see — a thin bar of how close they are.
 *
 * The same chip the front page draws above its Wordle Battle, and the one the
 * real battle draws, so the picture is the product.
 */
export function PlayerChip({
  name,
  status,
  avatarUrl,
  progress,
  done = false,
  lazy = false,
}: {
  name: string;
  status: string;
  /** `null` draws the silhouette — an opponent's face is not something a battle shares */
  avatarUrl?: string | null;
  /** 0..1 */
  progress?: number;
  /** solved: the chip takes the success colour */
  done?: boolean;
  lazy?: boolean;
}): React.JSX.Element {
  return (
    <div className={`player${done ? ' is-done' : ''}`}>
      <span className="player-face" aria-hidden="true">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" width={34} height={34} loading={lazy ? 'lazy' : undefined} decoding="async" />
        ) : (
          <PersonGlyph size={18} />
        )}
      </span>
      <span className="player-text">
        <span className="player-name">{name}</span>
        <span className="player-status">{status}</span>
      </span>
      {progress !== undefined && (
        <span className="player-meter" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}
