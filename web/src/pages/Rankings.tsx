import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { countryName } from '../lib/countries';
import { ErrorState, EmptyState } from '../components/states';
import { RankingsSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { useLocale, useT, type Translate } from '../i18n/I18nProvider';
import { LeagueCard } from '../leagues/LeagueCard';
import { RankList, RankRow } from '../ui/RankRow';
import { BOARD_NAME, BoardAmount, BoardSwitch, SpanSwitch, boardFor, isRankKind, type BoardType, type RankKind, type XpSpan } from '../ui/BoardSwitch';
import type { MessageKey } from '../i18n/en';
import { useArrival } from '../lib/motion';

interface Entry {
  userId: string;
  /** Ties share a place, so two rows can carry the same one. */
  rank: number;
  username: string;
  score: number;
  /** Already resolved; older servers send none, and the row draws the silhouette. */
  avatarUrl?: string | null;
}
interface Board {
  type: BoardType;
  scope: Scope;
  /** One page of the board, highest first. */
  top: Entry[];
  total: number;
  /** Your own place; its rank is null only below the cut of a board that stops at `depth`. */
  me: { rank: number | null; score: number } | null;
  /** Every board but this week's lists only this many. */
  depth?: number;
  /** Country scope only; null when the profile has no country. */
  country?: string | null;
}

type Scope = 'global' | 'friends' | 'country';

const PAGE = 25;

const SCOPES: { key: Scope; labelKey: MessageKey }[] = [
  { key: 'global', labelKey: 'rankings.scope.global' },
  { key: 'friends', labelKey: 'nav.friends' },
  { key: 'country', labelKey: 'rankings.scope.country' },
];

/**
 * Where you stand: by XP or Zêr. XP is this week's by default, with your league first as a card that opens the
 * whole league, or all time's. What is ranked (`?board=zer`) and the span (`?span=all`) are in the address, so either
 * can be linked to; who you are compared with is a choice of the moment, starting at everyone.
 */
export function Rankings(): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const [params, setParams] = useSearchParams();
  const asked = params.get('board');
  // `weekly_xp` was this week's board in older links.
  const kind: RankKind = isRankKind(asked) ? asked : 'xp';
  const span: XpSpan = params.get('span') === 'all' ? 'all' : 'week';
  const [scope, setScope] = useState<Scope>('global');
  const set = (key: string, value: string | null): void => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.delete('tab');
        if (value === null) out.delete(key);
        else out.set(key, value);
        return out;
      },
      { replace: true },
    );
  };
  const type = boardFor(kind, span);

  return (
    <div className="container container-narrow rankings-page">
      <h1 className="sr-only">{t('rankings.title')}</h1>
      <BoardSwitch value={kind} onChange={(next) => set('board', next === 'xp' ? null : next)} />
      {kind === 'xp' && <SpanSwitch value={span} onChange={(next) => set('span', next === 'all' ? 'all' : null)} />}
      {/* This week's XP is the league's: the reader's own group comes first. */}
      {type === 'weekly_xp' && status === 'signedIn' && <LeagueCard />}
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
      <Leaderboard type={type} scope={scope} />
    </div>
  );
}

/** Where the reader's own row is against the window: on screen, scrolled past, still below, or not on the page yet. */
type MeAt = 'shown' | 'above' | 'below' | 'absent';

/**
 * One board a page at a time. Your own row is picked out in place, and kept in view at the foot of the window while the
 * page has not reached it or it is still further down.
 */
function Leaderboard({ type, scope }: { type: BoardType; scope: Scope }): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [board, setBoard] = useState<Board | null>(null);
  /** Every page loaded so far, so "Show more" appends. */
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The board the last request was for; an answer for one switched away from is dropped. */
  const asking = useRef('');
  const list = useRef<HTMLDivElement>(null);
  const [meAt, setMeAt] = useState<MeAt>('absent');

  const load = useCallback(
    async (offset: number) => {
      const first = offset === 0;
      const key = `${type}:${scope}`;
      asking.current = key;
      if (first) {
        setLoading(true);
        // The last board's own place and paging say nothing about this one.
        setBoard(null);
      } else setLoadingMore(true);
      setError(null);
      const res = await client.get<Board>(`/leaderboards/${type}?scope=${scope}&limit=${PAGE}&offset=${offset}`);
      if (asking.current !== key) return;
      if (res.ok) {
        setBoard(res.data);
        // Append a later page; replace when the board or scope changed.
        setEntries((prev) => (first ? res.data.top : [...prev, ...res.data.top]));
      } else {
        setError(describeError(res.error, t));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [client, type, scope],
  );

  // Switching board or scope starts a fresh list.
  useEffect(() => {
    setEntries([]);
    void load(0);
  }, [load]);

  const meInList = board?.me != null && entries.some((e) => e.userId === user?.id);
  // Watch your own row once a page holds it, before the page is painted so the pinned copy never flashes; without a way
  // to watch, it counts as on screen.
  useLayoutEffect(() => {
    if (!meInList) return setMeAt('absent');
    const row = list.current?.querySelector('.rank-me');
    if (!row || typeof IntersectionObserver === 'undefined') return setMeAt('shown');
    const watch = new IntersectionObserver(([seen]) => {
      if (!seen) return;
      if (seen.isIntersecting) setMeAt('shown');
      else setMeAt(seen.boundingClientRect.top < 0 ? 'above' : 'below');
    });
    watch.observe(row);
    return () => watch.disconnect();
  }, [meInList, entries]);

  const shown = entries.length;
  const arriving = useArrival(shown > 0, 'rankings');
  const hasMore = board !== null && shown < board.total;
  const pinned = board?.me != null && (meAt === 'absent' || meAt === 'below');

  if (loading) return <RankingsSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => void load(0)} />;
  if (scope === 'country' && board?.country == null) {
    return (
      <EmptyState
        title={t('rankings.noCountry')}
        message={t('rankings.noCountryBody')}
        action={
          <Link className="btn btn-primary btn-sm state-action" to="/app/profile/edit">
            {t('profile.edit')}
          </Link>
        }
      />
    );
  }
  return (
    <div ref={list} className="rankings-board">
      {entries.length === 0 ? (
        <EmptyState title={t(emptyTitleKey(scope))} message={t(emptyMessageKey(scope, type))} />
      ) : (
        <>
          {scope === 'country' && board?.country && (
            <p className="page-sub" style={{ marginTop: 0 }}>
              {t('rankings.everyoneIn', { country: countryName(board.country, locale) ?? board.country })}
            </p>
          )}

          <RankList label={t(BOARD_NAME[type])} arriving={arriving}>
            {entries.map((e) => (
              <RankRow
                key={e.userId}
                rank={e.rank}
                name={e.username}
                href={`/app/users/${e.userId}`}
                avatarUrl={e.avatarUrl ?? null}
                score={<BoardAmount type={board!.type} amount={e.score} />}
                me={e.userId === user?.id}
                lazy
                marker={e.userId === user?.id ? <span className="rank-you">{t('rankings.youMarker')}</span> : undefined}
              />
            ))}
          </RankList>

          <div className="rank-more">
            {hasMore ? (
              <>
                <Button variant="ghost" onClick={() => void load(shown)} disabled={loadingMore}>
                  {loadingMore ? t('common.loading') : t('rankings.showMore', { count: Math.min(PAGE, board!.total - shown) })}
                </Button>
                <span className="muted">{t('rankings.shownOf', { shown, total: board!.total })}</span>
              </>
            ) : (
              <span className="muted">{endOfBoard(t, board!, shown, locale)}</span>
            )}
          </div>
        </>
      )}

      {/* Your standing, kept at the foot of the window while the board above has not reached you. */}
      {pinned && board?.me && (
        <div className="rank-standing" aria-hidden={meInList || undefined}>
          <RankList>
            <RankRow
              rank={board.me.rank}
              name={t('games.you')}
              avatarUrl={user?.avatarUrl ?? null}
              score={<BoardAmount type={board.type} amount={board.me.score} />}
              me
            />
          </RankList>
          {board.me.rank === null && board.depth ? (
            <p className="muted rank-standing-note">{t('rankings.notInTop', { count: board.depth.toLocaleString(locale) })}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** What a fully shown board's foot says: that this is everyone, or, for a board cut at its depth, that this is its top. */
function endOfBoard(t: Translate, board: Board, shown: number, locale: string): string {
  if (shown === 0 || shown < board.total) return '';
  if (board.depth && board.total >= board.depth) return t('rankings.topOnly', { count: board.depth.toLocaleString(locale) });
  return t('rankings.thatsEveryone', { total: board.total });
}

function emptyTitleKey(scope: Scope): MessageKey {
  if (scope === 'friends') return 'rankings.empty.friends';
  if (scope === 'country') return 'rankings.empty.country';
  return 'rankings.empty.global';
}

/** This week's empty states talk about this week, the balances' about holding some; all time has neither. */
function emptyMessageKey(scope: Scope, type: BoardType): MessageKey {
  if (scope === 'friends') return 'rankings.empty.friendsBody';
  if (scope === 'country') return type === 'weekly_xp' ? 'rankings.empty.countryBody' : 'rankings.empty.balanceCountryBody';
  return type === 'zer' ? 'rankings.empty.balanceGlobalBody' : 'rankings.empty.globalBody';
}
