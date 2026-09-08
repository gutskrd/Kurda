import type { LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { GiftIcon } from '../components/icons';

/**
 * Shared cosmetic render parts used by both the profile popup and the full
 * profile page, so equipped cosmetics look identical in both. Presentation only —
 * access/ownership is resolved server-side before these ever receive a value.
 */

/** Renders an equipped background as the right element for its media type. */
export function CosmeticBackground({ background, className }: { background: ProfileBackground; className?: string }): React.JSX.Element {
  const cls = className ?? 'pcard-bg-media';
  if (background.type === 'video') {
    return (
      <video
        className={cls}
        src={background.url}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        tabIndex={-1}
      />
    );
  }
  // image + gif both render as <img> (gif animates natively)
  return <img className={cls} src={background.url} alt="" aria-hidden="true" />;
}

/** Level badge + progress bar toward the next level (derived server-side). */
export function LevelBar({ level }: { level: LevelInfo }): React.JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, level.progress)) * 100);
  const toNext = Math.max(0, level.nextLevelXp - level.xp);
  return (
    <div className="pcard-level" title={`${toNext.toLocaleString()} XP to level ${level.level + 1}`}>
      <div className="pcard-level-head">
        <span className="pcard-level-badge">Level {level.level}</span>
        <span className="pcard-level-xp">{level.xp.toLocaleString()} XP</span>
      </div>
      <div className="pcard-level-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="pcard-level-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A gold "Premium" pill. */
export function PremiumPill(): React.JSX.Element {
  return (
    <span className="pcard-premium" title="Premium member">
      Premium
    </span>
  );
}

/**
 * The equipped premium icon, rendered as a decorative overlay that straddles the
 * avatar boundary (partly inside, partly outside). Place it inside a
 * position:relative avatar container; sizing/offset come from that container's
 * CSS so the icon scales with the avatar. It is a separate layer over the
 * avatar — never baked into the avatar image.
 */
export function IconOverlay({ icon }: { icon: ProfileIcon }): React.JSX.Element {
  return (
    <img
      className="cosmetic-icon-overlay"
      src={icon.url}
      alt=""
      role="img"
      aria-label="Premium profile icon"
    />
  );
}

/**
 * Who gave them what they are wearing.
 *
 * Half the point of a gift is that it is seen to be from someone. Without this
 * a gifted background is indistinguishable from a bought one the moment it is
 * equipped, which is a present with the card thrown away.
 *
 * Shown on both profile surfaces from one component, so the two cannot drift.
 * Nothing is rendered when nothing was gifted — an empty line saying so would
 * only be noise on the great majority of profiles.
 */
export function GiftedNote({
  background,
  icon,
}: {
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
}): React.JSX.Element | null {
  const notes: Array<{ what: string; from: string }> = [];
  if (background?.giftedBy) notes.push({ what: 'Background', from: background.giftedBy.username });
  if (icon?.giftedBy) notes.push({ what: 'Icon', from: icon.giftedBy.username });
  if (notes.length === 0) return null;

  return (
    <ul className="gifted-notes">
      {notes.map((n) => (
        <li key={n.what} className="gifted-note">
          <GiftIcon size={14} />
          <span>
            {n.what} gifted by <strong>@{n.from}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}
