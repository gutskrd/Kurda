import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { countryName } from '../lib/countries';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Button } from '../components/Button';

interface Entry {
  userId: string;
  rank: number;
  username: string;
  score: number;
}
interface Board {
  type: BoardType;
  scope: Scope;
  /** one page of the board, highest first */
  top: Entry[];
  total: number;
  me: { rank: number; score: number } | null;
  /** country scope only; null when no country is set on the profile */
  country?: string | null;
}

type BoardType = 'weekly_xp' | 'rating';
type Scope = 'global' | 'friends' | 'country';

const PAGE = 25;

const BOARDS: { key: BoardType; label: string; unit: string; blurb: string }[] = [
  { key: 'weekly_xp', label: 'Weekly XP', unit: 'XP', blurb: 'This week’s top learners by experience earned.' },
  { key: 'rating', label: 'Rating', unit: 'Rating', blurb: 'All-time skill rating from ranked matches.' },
];

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'friends', label: 'Friends' },
  { key: 'country', label: 'My country' },
];

export function Rankings(): React.JSX.Element {
  const { client, user } = useAuth();
  const [type, setType] = useState<BoardType>('weekly_xp');
  const [scope, setScope] = useState<Scope>('global');
  const [board, setBoard] = useState<Board | null>(null);
  /** every page loaded so far, so "Show more" appends instead of replacing */
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = BOARDS.find((b) => b.key === type)!;

  const load = useCallback(
    async (offset: number) => {
      const first = offset === 0;
      if (first) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const res = await client.get<Board>(`/leaderboards/${type}?scope=${scope}&limit=${PAGE}&offset=${offset}`);
      if (res.ok) {
        setBoard(res.data);
        // append on a later page; replace when the board or scope changed
        setEntries((prev) => (first ? res.data.top : [...prev, ...res.data.top]));
      } else {
        setError(describeError(res.error));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [client, type, scope],
  );

  // switching board or scope starts a fresh list
  useEffect(() => {
    setEntries([]);
    void load(0);
  }, [load]);

  const shown = entries.length;
  const hasMore = board !== null && shown < board.total;
  // your own row is highlighted in place rather than repeated above the list
  const meInList = board?.me != null && entries.some((e) => e.userId === user?.id);

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">Pilebendî · Leaderboards</span>
        <h1 className="page-title">Rankings</h1>
        <p className="page-sub">{meta.blurb}</p>
      </div>

      <div className="toolbar" role="tablist" aria-label="Leaderboard">
        {BOARDS.map((b) => (
          <button
            key={b.key}
            role="tab"
            aria-selected={type === b.key}
            className={`chip${type === b.key ? ' active' : ''}`}
            onClick={() => setType(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="toolbar" role="tablist" aria-label="Who to compare with">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={scope === s.key}
            className={`chip${scope === s.key ? ' active' : ''}`}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* your standing on THIS board — a global rank would be misleading here */}
      {board?.me && !meInList && (
        <div className="rank-row rank-me" style={{ marginBottom: 16 }}>
          <span className="rank-pos">#{board.me.rank}</span>
          <span className="rank-name">You</span>
          <span className="rank-score">
            {board.me.score.toLocaleString()} {meta.unit}
          </span>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(0)} />
      ) : scope === 'country' && board?.country == null ? (
        <EmptyState
          title="No country set"
          message="Add a country to your profile to see how you rank against people there."
          action={
            <Link className="btn btn-primary btn-sm" to="/app/profile/edit">
              Edit profile
            </Link>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState title={emptyTitle(scope)} message={emptyMessage(scope)} />
      ) : (
        <>
          {scope === 'country' && board?.country && (
            <p className="page-sub" style={{ marginTop: 0 }}>
              Everyone in {countryName(board.country) ?? board.country}.
            </p>
          )}

          <div className="post-list">
            {entries.map((e) => (
              <div className={`rank-row${e.userId === user?.id ? ' rank-me' : ''}`} key={e.userId}>
                <span className="rank-pos">{medal(e.rank)}</span>
                <Link className="rank-name" to={`/app/users/${e.userId}`}>
                  {e.username}
                  {e.userId === user?.id && <span className="rank-you">you</span>}
                </Link>
                <span className="rank-score">
                  {e.score.toLocaleString()} {meta.unit}
                </span>
              </div>
            ))}
          </div>

          <div className="rank-more">
            {hasMore ? (
              <>
                <Button variant="ghost" onClick={() => void load(shown)} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, board!.total - shown)} more`}
                </Button>
                <span className="muted">
                  {shown} of {board!.total}
                </span>
              </>
            ) : (
              <span className="muted">
                {board!.total === shown && shown > 0 ? `That’s everyone — ${board!.total} ranked.` : ''}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The top three read better as medals than as numbers. */
function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
}

function emptyTitle(scope: Scope): string {
  if (scope === 'friends') return 'No ranked friends yet';
  if (scope === 'country') return 'Nobody ranked here yet';
  return 'No rankings yet';
}

function emptyMessage(scope: Scope): string {
  if (scope === 'friends') return 'Add friends and play a little — you will both show up here.';
  if (scope === 'country') return 'Be the first from your country to earn points this week.';
  return 'Once learners start earning points, the leaderboard will fill up here.';
}
