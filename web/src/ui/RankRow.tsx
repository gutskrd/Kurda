import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PersonGlyph } from '../components/icons';
import { useAvatarSrc } from '../art/overrides';

/**
 * A leaderboard: one card of quiet rows reading place, person, score, with the reader's own row picked out. Every
 * board in the app and the front page's picture of one are built from these.
 */
export function RankList({ children, label, arriving = false }: { children: ReactNode; label?: string; arriving?: boolean }): React.JSX.Element {
  return (
    // While `arriving` (lib/motion.ts useArrival) the first screenful of rows rises in, as on the phone.
    <ol className={arriving ? 'rank-list rise-in' : 'rank-list'} aria-label={label}>
      {children}
    </ol>
  );
}

/**
 * One row of a board. With `href` the name is a link stretched over the whole row (product.css), while a control in
 * `trailing` keeps its own presses.
 */
export function RankRow({
  rank,
  name,
  score,
  href,
  avatarUrl,
  face,
  me = false,
  marker,
  trailing,
  zone,
  lazy = false,
}: {
  /** Null for the reader's own row on a board that stops before it; shown as a dash. */
  rank: number | null;
  name: string;
  /** Already formatted, with its unit. */
  score: ReactNode;
  /** Where the name links to, when there is a profile. */
  href?: string;
  /** Omitted for a board with no faces; `null` draws the silhouette. */
  avatarUrl?: string | null;
  /** A face drawn by the board itself, such as initials, in place of a picture. */
  face?: ReactNode;
  me?: boolean;
  /** A word after the name, such as "you". */
  marker?: ReactNode;
  /** After the score, such as where a league row is heading. */
  trailing?: ReactNode;
  /** A league row about to move gets a thin edge; `trailing` names it for screen readers. */
  zone?: 'promotion' | 'demotion';
  lazy?: boolean;
}): React.JSX.Element {
  const photo = useAvatarSrc(avatarUrl);
  const who = (
    <>
      {name}
      {marker}
    </>
  );
  return (
    <li className={`rank-row${me ? ' rank-me' : ''}${zone ? ` is-${zone}` : ''}${rank !== null && rank <= 3 ? ' is-podium' : ''}`}>
      <span className="rank-pos">{rank ?? '–'}</span>
      {face !== undefined ? (
        <span className="rank-face" aria-hidden="true">
          {face}
        </span>
      ) : avatarUrl !== undefined ? (
        <span className="rank-face" aria-hidden="true">
          {photo ? <img src={photo} alt="" width={28} height={28} loading={lazy ? 'lazy' : undefined} /> : <PersonGlyph size={16} />}
        </span>
      ) : null}
      {href ? (
        <Link className="rank-name" to={href}>
          {who}
        </Link>
      ) : (
        <span className="rank-name">{who}</span>
      )}
      <span className="rank-score">{score}</span>
      {trailing}
    </li>
  );
}
