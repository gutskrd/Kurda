import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { countryName } from '../lib/countries';
import { ErrorState, EmptyState } from '../components/states';
import { RankingsSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import { LeaguePanel } from '../leagues/LeaguePanel';
import { RankList, RankRow } from '../ui/RankRow';
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

/*
 * The all-time rating board went with the ranked quiz that fed it: nothing
 * earns rating any more, so a board of it would only ever show who played a
 * game that is gone. Weekly XP is the one board.
 */
type BoardType = 'weekly_xp';
type Scope = 'global' | 'friends' | 'country';

const PAGE = 25;

const BOARDS: { key: BoardType; labelKey: MessageKey; unitKey: MessageKey; blurbKey: MessageKey }[] = [
  {
    key: 'weekly_xp',
    labelKey: 'rankings.board.weeklyXp',
    unitKey: 'rankings.unit.xp',
    blurbKey: 'rankings.board.weeklyXpBlurb',
  },
];

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
 * Where you stand, as two tabs, the way the phone has it: your league this
 * week — its own page, with nothing boxed — and the leaderboard of everyone.
 * The league comes first because it is the one with a week and a group; the
 * tab is in the address (`?tab=board`), so either can be linked to.
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
  // the arrow keys move between the two, as tabs do; the order follows the reading direction
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
        {tab === 'league' ? <LeaguePanel /> : <WeeklyBoard />}
      </div>
    </div>
  );
}

/** Everyone's XP this week — worldwide, among your friends, or in your country — a page at a time. */
function WeeklyBoard(): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const type: BoardType = 'weekly_xp';
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
    <>
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

      {/* your standing on THIS board — a global rank would be misleading here */}
      {board?.me && !meInList && (
        <div className="rank-standing">
          <RankList>
            <RankRow
              rank={board.me.rank}
              name={t('games.you')}
              score={`${board.me.score.toLocaleString()} ${t(meta.unitKey)}`}
              me
            />
          </RankList>
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
        <EmptyState title={t(emptyTitleKey(scope))} message={t(emptyMessageKey(scope))} />
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
                score={`${e.score.toLocaleString()} ${t(meta.unitKey)}`}
                me={e.userId === user?.id}
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
              <span className="muted">
                {board!.total === shown && shown > 0 ? t('rankings.thatsEveryone', { total: board!.total }) : ''}
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
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
