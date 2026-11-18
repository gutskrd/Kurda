import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { countryName } from '../lib/countries';
import { ErrorState, EmptyState } from '../components/states';
import { RankingsSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { useLocale, useT, type Translate } from '../i18n/I18nProvider';
import { LeaguePanel } from '../leagues/LeaguePanel';
import { RankList, RankRow } from '../ui/RankRow';
import { BOARD_KINDS, BoardAmount, BoardSwitch, isBoardType, type BoardType } from '../ui/BoardSwitch';
import type { MessageKey } from '../i18n/en';

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
  /** Zêr and Gewher boards list only this many. */
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

type Tab = 'league' | 'board';
const TABS: { key: Tab; labelKey: MessageKey }[] = [
  { key: 'league', labelKey: 'rankings.tab.league' },
  { key: 'board', labelKey: 'rankings.tab.board' },
];

/**
 * Where you stand, as two tabs as on the phone: your league this week, then the leaderboard of everyone. The tab
 * (`?tab=board`) and what the board ranks (`&board=zer`) are in the address, so either can be linked to.
 */
export function Rankings(): React.JSX.Element {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'board' ? 'board' : 'league';
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const choose = (next: Tab, focus = false): void => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next === 'league') out.delete('tab');
        else out.set('tab', next);
        return out;
      },
      { replace: true },
    );
    if (focus) buttons.current[TABS.findIndex((x) => x.key === next)]?.focus();
  };
  // Arrow keys move between the tabs, in reading order.
  const onKey = (e: React.KeyboardEvent): void => {
    const rtl = document.documentElement.dir === 'rtl';
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      choose(e.key === 'Home' ? TABS[0]!.key : TABS[TABS.length - 1]!.key, true);
    } else if (step) {
      e.preventDefault();
      const at = TABS.findIndex((x) => x.key === tab);
      choose(TABS[(at + step + TABS.length) % TABS.length]!.key, true);
    }
  };

  return (
    <div className="container container-narrow rankings-page">
      <h1 className="sr-only">{t('rankings.title')}</h1>
      <div className="rankings-tabs" role="tablist" aria-label={t('rankings.title')} onKeyDown={onKey}>
        {TABS.map((x, i) => (
          <button
            key={x.key}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`rankings-tab-${x.key}`}
            aria-selected={tab === x.key}
            aria-controls={`rankings-panel-${x.key}`}
            tabIndex={tab === x.key ? 0 : -1}
            className={`rankings-tab${tab === x.key ? ' is-active' : ''}`}
            onClick={() => choose(x.key)}
          >
            {t(x.labelKey)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`rankings-panel-${tab}`} aria-labelledby={`rankings-tab-${tab}`}>
        {tab === 'league' ? <LeaguePanel /> : <Leaderboard />}
      </div>
    </div>
  );
}

/**
 * The leaderboard a page at a time: this week's XP, or Zêr or Gewher held now (BoardSwitch), worldwide, among friends or
 * in your country. What it ranks is in the address; the scope is a choice of the moment, starting at everyone.
 */
function Leaderboard(): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [params, setParams] = useSearchParams();
  const asked = params.get('board');
  const type: BoardType = isBoardType(asked) ? asked : 'weekly_xp';
  const chooseType = (next: BoardType): void => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next === 'weekly_xp') out.delete('board');
        else out.set('board', next);
        return out;
      },
      { replace: true },
    );
  };
  const [scope, setScope] = useState<Scope>('global');
  const [board, setBoard] = useState<Board | null>(null);
  /** Every page loaded so far, so "Show more" appends. */
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The board the last request was for; an answer for one switched away from is dropped. */
  const asking = useRef('');

  const meta = BOARD_KINDS.find((b) => b.key === type)!;

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

  const shown = entries.length;
  const hasMore = board !== null && shown < board.total;
  // Your own row is highlighted in place rather than repeated above the list.
  const meInList = board?.me != null && entries.some((e) => e.userId === user?.id);

  return (
    <>
      <BoardSwitch value={type} onChange={chooseType} />
      <p className="page-sub rankings-blurb">{t(meta.blurbKey)}</p>

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

      {/* Your standing on this board, pinned above it while the page does not reach you. */}
      {board?.me && !meInList && (
        <div className="rank-standing">
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

      {loading ? (
        <RankingsSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(0)} />
      ) : scope === 'country' && board?.country == null ? (
        <EmptyState
          title={t('rankings.noCountry')}
          message={t('rankings.noCountryBody')}
          action={
            <Link className="btn btn-primary btn-sm state-action" to="/app/profile/edit">
              {t('profile.edit')}
            </Link>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState title={t(emptyTitleKey(scope))} message={t(emptyMessageKey(scope, type))} />
      ) : (
        <>
          {scope === 'country' && board?.country && (
            <p className="page-sub" style={{ marginTop: 0 }}>
              {t('rankings.everyoneIn', { country: countryName(board.country, locale) ?? board.country })}
            </p>
          )}

          <RankList label={t(meta.labelKey)}>
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
                  {loadingMore
                    ? t('common.loading')
                    : t('rankings.showMore', { count: Math.min(PAGE, board!.total - shown) })}
                </Button>
                <span className="muted">
                  {t('rankings.shownOf', { shown, total: board!.total })}
                </span>
              </>
            ) : (
              <span className="muted">{endOfBoard(t, board!, shown, locale)}</span>
            )}
          </div>
        </>
      )}
    </>
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

/** The weekly board's empty states talk about this week; a balance has no week. */
function emptyMessageKey(scope: Scope, type: BoardType): MessageKey {
  if (scope === 'friends') return 'rankings.empty.friendsBody';
  if (scope === 'country') return type === 'weekly_xp' ? 'rankings.empty.countryBody' : 'rankings.empty.balanceCountryBody';
  return type === 'weekly_xp' ? 'rankings.empty.globalBody' : 'rankings.empty.balanceGlobalBody';
}
