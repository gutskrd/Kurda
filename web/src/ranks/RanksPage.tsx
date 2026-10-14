import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FEW_PLAYERS,
  RANKED_GAMES,
  RANK_TIERS,
  STERK_RULE,
  isRankedGame,
  type MyRanks,
  type RankBoard,
  type RankBoardScope,
  type RankTier,
  type RankedGame,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { ArrowIcon } from '../components/icons';
import { ErrorState, Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { RankList, RankRow } from '../ui/RankRow';
import { RankEmblem } from './art';
import { RankCard } from './RankCard';
import { gameName, rankLabel, rankTierNamed, seasonNamed } from './names';

/** The climb from the top down: Stêrk, then Lûtke to Deşt. */
const LADDER: readonly RankTier[] = ['sterk', ...[...RANK_TIERS].reverse().map((r) => r.key)];

/**
 * One game's rank up close (contract 4 §R4, §R6, §U), the browser's half of the
 * phone's Ranks screen: the rank card, the climb from Deşt to Stêrk with where
 * you stand on it, and the game's two boards — your friends (always, at any
 * age) and the top players.
 *
 * The boards show what the API sends and nothing more: the Top board lists
 * known adults only, by name only when their profile is public ("Player"
 * otherwise), and stays closed while too few people play the game rated for a
 * top list to mean anything. Rows carry no account and link nowhere, so a
 * board is never a way to find someone.
 */
export function RanksPage(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const params = useParams();
  const game: RankedGame = isRankedGame(params.game) ? params.game : RANKED_GAMES[0];
  const [ranks, setRanks] = useState<MyRanks | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<MyRanks>('/ranks/me');
    if (res.ok) setRanks(res.data);
    else setError(describeError(res.error, t));
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !ranks) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!ranks) return <Loading />;
  const card = ranks.ranks.find((r) => r.game === game) ?? null;
  const season = seasonNamed(t, ranks.season);

  return (
    <div className="container ranks-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('ranks.title')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>
            {gameName(t, game)}
          </h1>
        </div>
      </div>

      <nav className="toolbar ranks-page-games" aria-label={t('nav.games')}>
        {RANKED_GAMES.map((g) => (
          <Link key={g} to={`/app/ranks/${g}`} className={`chip${g === game ? ' active' : ''}`} aria-current={g === game ? 'page' : undefined}>
            {gameName(t, g)}
          </Link>
        ))}
      </nav>

      {card && <RankCard rank={card} />}

      <Link to="/app/season" className="ranks-season-link ranks-page-season">
        <span className="ranks-season-name">{season.name}</span>
        <span className="ranks-season-days">
          {ranks.season.daysLeft > 0 ? t('seasons.daysLeft', { days: ranks.season.daysLeft }) : t('seasons.lastDay')}
        </span>
      </Link>

      <Boards key={game} game={game} />
      {card && <Ladder here={card.placement === null ? card.tier : null} />}
    </div>
  );
}

/** The six tiers, top down, each with what it takes; yours is marked in words, not by colour alone. */
function Ladder({ here }: { here: RankTier | null }): React.JSX.Element {
  const t = useT();
  return (
    <section className="ranks-page-block" aria-labelledby="ranks-ladder">
      <h2 id="ranks-ladder" className="badges-section-title">
        {t('ranks.ladder')}
      </h2>
      <ol className="rank-ladder">
        {LADDER.map((tier) => {
          const named = rankTierNamed(t, tier);
          const floor = RANK_TIERS.find((r) => r.key === tier)?.floor;
          const fact =
            floor === undefined
              ? t('ranks.sterkRule', { share: STERK_RULE.topShare * 100, tier: rankLabel(t, 'lutke', 1), games: STERK_RULE.minGames })
              : t('ranks.floor', { count: floor });
          const mine = tier === here;
          return (
            <li key={tier} className={`rank-rung tier-${tier}${mine ? ' is-here' : ''}`} aria-current={mine ? 'step' : undefined}>
              <RankEmblem tier={tier} size={44} title={rankLabel(t, tier, null)} />
              <span className="rank-rung-text">
                <span className="rank-rung-name">
                  {named.name}
                  {named.meaning && <span className="rank-rung-meaning">{named.meaning}</span>}
                </span>
                <span className="rank-rung-fact">{fact}</span>
              </span>
              {mine && <span className="rank-rung-here">{t('ranks.youAreHere')}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const SCOPES: readonly RankBoardScope[] = ['friends', 'top'];

/** A game's Friends board (always there) or its Top board (adults only, closed while few play rated). */
function Boards({ game }: { game: RankedGame }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [scope, setScope] = useState<RankBoardScope>('friends');
  const [board, setBoard] = useState<RankBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setBoard(null);
    setError(null);
    void client.get<RankBoard>(`/ranks/boards/${game}?scope=${scope}`).then((res) => {
      if (!live) return;
      if (res.ok) setBoard(res.data);
      else setError(describeError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [client, game, scope, t, attempt]);

  const title = scope === 'friends' ? t('ranks.board.friends') : t('ranks.board.top');
  const meOnBoard = board?.entries.some((e) => e.isMe) ?? false;

  return (
    <section className="ranks-page-block" aria-labelledby="ranks-boards">
      <h2 id="ranks-boards" className="badges-section-title">
        {t('ranks.boards')}
      </h2>
      <div className="toolbar" role="tablist" aria-label={t('ranks.boards')}>
        {SCOPES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={scope === s} className={`chip${scope === s ? ' active' : ''}`} onClick={() => setScope(s)}>
            {s === 'friends' ? t('ranks.board.friends') : t('ranks.board.top')}
          </button>
        ))}
      </div>
      {scope === 'top' && <p className="season-block-help">{t('ranks.board.topHelp')}</p>}
      {error ? (
        <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !board ? (
        <Loading />
      ) : board.hidden ? (
        <p className="ranks-note">{t('ranks.board.hidden', { count: FEW_PLAYERS })}</p>
      ) : board.entries.length === 0 ? (
        <p className="ranks-note">{scope === 'friends' ? t('ranks.board.friendsEmpty') : t('ranks.board.topEmpty')}</p>
      ) : (
        <RankList label={title}>
          {board.entries.map((e) => {
            const rank = e.resting ? t('ranks.resting') : e.placing || !e.tier ? t('ranks.placingShort') : rankLabel(t, e.tier, e.division);
            return (
              <RankRow
                key={`${e.position}:${e.isMe ? 'me' : (e.name ?? '')}`}
                rank={e.position}
                name={e.isMe ? t('games.you') : (e.name ?? t('ranks.board.player'))}
                me={e.isMe}
                score={
                  <span className="rank-board-score">
                    <span>{t('ranks.points', { points: e.points.toLocaleString() })}</span>
                    <span className="rank-board-tier">{rank}</span>
                  </span>
                }
              />
            );
          })}
        </RankList>
      )}
      {board?.me && !meOnBoard && !board.hidden && (
        <p className="ranks-page-me">{t('ranks.board.yourPlace', { position: board.me.position, points: board.me.points.toLocaleString() })}</p>
      )}
    </section>
  );
}
