import type { LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { GiftIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';

/**
 * Cosmetic render parts shared by the profile popup and the full profile, so both look the same. Presentation only;
 * the server resolves ownership.
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

/** The level, a bar toward the next one, and a line saying what is left to earn, all from the server. */
export function LevelBar({ level }: { level: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'> }): React.JSX.Element {
  const t = useT();
  const pct = Math.round(Math.min(1, Math.max(0, level.progress)) * 100);
  const toNext = Math.max(0, level.nextLevelXp - level.xp);
  const next = t('profile.xpToLevel', { xp: toNext.toLocaleString(), level: level.level + 1 });
  return (
    <div className="pcard-level">
      <span className="pcard-level-badge">{t('profile.levelN', { level: level.level })}</span>
      <div className="pcard-level-track" role="progressbar" aria-label={next} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        {/* a full-width fill moved along its track by `--p` (styles/motion.css), as the lesson's bar is */}
        <div className="pcard-level-fill" style={{ '--p': pct / 100 } as React.CSSProperties} />
      </div>
      <span className="pcard-level-next" aria-hidden="true">{next}</span>
    </div>
  );
}

/** A gold "Premium" pill. */
export function PremiumPill(): React.JSX.Element {
  const t = useT();
  return (
    <span className="pcard-premium" title={t('profile.premiumMember')}>
      {t('profile.premium')}
    </span>
  );
}

/**
 * The equipped icon as a decorative layer straddling the avatar's edge, inside a position:relative avatar container
 * whose CSS sizes it; never baked into the avatar image.
 */
export function IconOverlay({ icon }: { icon: ProfileIcon }): React.JSX.Element {
  const t = useT();
  return (
    <img
      className="cosmetic-icon-overlay"
      src={icon.url}
      alt=""
      role="img"
      aria-label={t('profile.premiumIcon')}
    />
  );
}

/** Who gave the equipped cosmetics, on both profile surfaces; nothing when nothing was gifted. */
export function GiftedNote({
  background,
  icon,
}: {
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
}): React.JSX.Element | null {
  const t = useT();
  // Whole sentences per kind, since word order and noun forms differ between languages.
  const notes: Array<{ key: string; text: string }> = [];
  if (background?.giftedBy)
    notes.push({ key: 'background', text: t('profile.backgroundGiftedBy', { name: background.giftedBy.username }) });
  if (icon?.giftedBy) notes.push({ key: 'icon', text: t('profile.iconGiftedBy', { name: icon.giftedBy.username }) });
  if (notes.length === 0) return null;

  return (
    <ul className="gifted-notes">
      {notes.map((n) => (
        <li key={n.key} className="gifted-note">
          <GiftIcon size={14} />
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}
