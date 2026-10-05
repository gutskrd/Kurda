import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PersonGlyph } from '../components/icons';

/**
 * A leaderboard: one card, quiet rows, and your own row picked out.
 *
 * Every board in the app — the weekly league, the global and country boards,
 * the end of a battle — and the front page's picture of one are built from
 * these, so they all read the same way: place, who, score.
 *
 * Each row used to be its own bordered glass box with a medal emoji for the top
 * three. A stack of thirty boxes is thirty things competing for attention; rows
 * inside one card let the eye run down the numbers, which is what a table of
 * standings is for.
 */
export function RankList({ children, label }: { children: ReactNode; label?: string }): React.JSX.Element {
  return (
    <ol className="rank-list" aria-label={label}>
      {children}
    </ol>
  );
}

export function RankRow({
  rank,
  name,
  score,
  href,
  avatarUrl,
  me = false,
  marker,
  trailing,
  zone,
  lazy = false,
}: {
  rank: number;
  name: string;
  /** already formatted, unit and all */
  score: ReactNode;
  /** where the name goes, when there is a profile to go to */
  href?: string;
  /** leave out for a board that has no faces; `null` draws the silhouette */
  avatarUrl?: string | null;
  me?: boolean;
  /** a word after the name, such as "you" */
  marker?: ReactNode;
  /** after the score: where a league row is heading */
  trailing?: ReactNode;
  /** a league row about to move: a thin edge, named in `trailing` for anyone who cannot see it */
  zone?: 'promotion' | 'demotion';
  lazy?: boolean;
}): React.JSX.Element {
  const who = (
    <>
      {name}
      {marker}
    </>
  );
  return (
    <li className={`rank-row${me ? ' rank-me' : ''}${zone ? ` is-${zone}` : ''}${rank <= 3 ? ' is-podium' : ''}`}>
      <span className="rank-pos">{rank}</span>
      {avatarUrl !== undefined && (
        <span className="rank-face" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" width={28} height={28} loading={lazy ? 'lazy' : undefined} /> : <PersonGlyph size={16} />}
        </span>
      )}
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
