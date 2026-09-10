import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { countryName } from '../lib/countries';
import { ErrorState, EmptyState } from '../components/states';
import { RankingsSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

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

const BOARDS: { key: BoardType; labelKey: MessageKey; unitKey: MessageKey; blurbKey: MessageKey }[] = [
  {
    key: 'weekly_xp',
    labelKey: 'rankings.board.weeklyXp',
    unitKey: 'rankings.unit.xp',
    blurbKey: 'rankings.board.weeklyXpBlurb',
  },
  {
    key: 'rating',
    labelKey: 'rankings.board.rating',
    unitKey: 'rankings.board.rating',
    blurbKey: 'rankings.board.ratingBlurb',
  },
];

const SCOPES: { key: Scope; labelKey: MessageKey }[] = [
  { key: 'global', labelKey: 'rankings.scope.global' },
  { key: 'friends', labelKey: 'nav.friends' },
  { key: 'country', labelKey: 'rankings.scope.country' },
];

export function Rankings(): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
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
        setError(describeError(res.error, t));
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
        <span className="eyebrow">{t('rankings.eyebrow')}</span>
        <h1 className="page-title">{t('rankings.title')}</h1>
        <p className="page-sub">{t(meta.blurbKey)}</p>
      </div>

      <div className="toolbar" role="tablist" aria-label={t('rankings.leaderboard')}>
        {BOARDS.map((b) => (
          <button
            key={b.key}
            role="tab"
            aria-selected={type === b.key}
            className={`chip${type === b.key ? ' active' : ''}`}
            onClick={() => setType(b.key)}
          >
            {t(b.labelKey)}
          </button>
        ))}
      </div>

      <div className="toolbar" role="tablist" aria-label={t('rankings.compareWith')}>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={scope === s.key}
            className={`chip${scope === s.key ? ' active' : ''}`}
            onClick={() => setScope(s.key)}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {/* your standing on THIS board — a global rank would be misleading here */}
      {board?.me && !meInList && (
        <div className="rank-row rank-me" style={{ marginBottom: 16 }}>
          <span className="rank-pos">#{board.me.rank}</span>
          <span className="rank-name">{t('games.you')}</span>
          <span className="rank-score">
            {board.me.score.toLocaleString()} {t(meta.unitKey)}
          </span>
        </div>
      )}

      {loading ? (
        <RankingsSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(0)} />
      ) : scope === 'country' && board?.country == null ? (
        <EmptyState
          title={t('rankings.noCountry')}
          message={t('rankings.noCountryBody')}
          action={
            <Link className="btn btn-primary btn-sm" to="/app/profile/edit">
              Edit profile
            </Link>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState title={t(emptyTitleKey(scope))} message={t(emptyMessageKey(scope))} />
      ) : (
        <>
          {scope === 'country' && board?.country && (
            <p className="page-sub" style={{ marginTop: 0 }}>
              {t('rankings.everyoneIn', { country: countryName(board.country, locale) ?? board.country })}
            </p>
          )}

          <div className="post-list">
            {entries.map((e) => (
              <div className={`rank-row${e.userId === user?.id ? ' rank-me' : ''}`} key={e.userId}>
                <span className="rank-pos">{medal(e.rank)}</span>
                <Link className="rank-name" to={`/app/users/${e.userId}`}>
                  {e.username}
                  {e.userId === user?.id && <span className="rank-you">{t('rankings.youMarker')}</span>}
                </Link>
                <span className="rank-score">
                  {e.score.toLocaleString()} {t(meta.unitKey)}
                </span>
              </div>
            ))}
          </div>

          <div className="rank-more">
            {hasMore ? (
              <>
                <Button variant="ghost" onClick={() => void load(shown)} disabled={loadingMore}>
                  {loadingMore
                    ? t('common.loading')
                    : t('rankings.showMore', { count: Math.min(PAGE, board!.total - shown) })}
                </Button>
                <span className="muted">
                  {t('rankings.shownOf', { shown, total: board!.total })}
                </span>
              </>
            ) : (
              <span className="muted">
                {board!.total === shown && shown > 0 ? t('rankings.thatsEveryone', { total: board!.total }) : ''}
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

function emptyTitleKey(scope: Scope): MessageKey {
  if (scope === 'friends') return 'rankings.empty.friends';
  if (scope === 'country') return 'rankings.empty.country';
  return 'rankings.empty.global';
}

function emptyMessageKey(scope: Scope): MessageKey {
  if (scope === 'friends') return 'rankings.empty.friendsBody';
  if (scope === 'country') return 'rankings.empty.countryBody';
  return 'rankings.empty.globalBody';
}
