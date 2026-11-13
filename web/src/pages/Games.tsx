import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameEmblemTone, gameOfTheDay, type GameEmblem } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { LinkButton } from '../components/Button';
import { useAuth } from '../auth/AuthProvider';
import { RanksSection } from '../ranks/RanksSection';
import { LearnHeader } from '../learn/LearnHeader';
import { ChevronIcon, TrophyIcon, UserIcon, UsersIcon } from '../components/icons';
import { JoinCodeEntry } from '../play/JoinCode';
import { WEB_LEARN_GAMES, useListedLearnGames } from '../games/learnGames';
import { GameArt } from '../games/GameArt';
import '../games/games-page.css';

/** Who a game is played with, said on its card. */
type Company = 'solo' | 'friends';

/**
 * A game as the page lists it.
 *
 * Keys rather than text, resolved at render: the three games below are built
 * once when the module loads, so a label baked in here would keep whichever
 * language the app happened to start in even after somebody changed it.
 */
export interface GameEntry {
  id: GameEmblem;
  nameKey: MessageKey;
  /** one line for its card */
  lineKey: MessageKey;
  /** what it is, said in full where there is room: the featured card */
  bodyKey: MessageKey;
  /** its ways in, one per page it has; a game whose own page asks how to play has one */
  ways: ReadonlyArray<{ labelKey: MessageKey; href: string }>;
  company: readonly Company[];
  /** false while it is short of approved content: listed, and not opened */
  ready: boolean;
}

/** The three games that have always been here: each has its own pages, rules and tables (see games/registry.ts). */
const CLASSICS: readonly GameEntry[] = [
  {
    id: 'peyvok',
    nameKey: 'games.wordle.name',
    lineKey: 'games.card.wordle',
    bodyKey: 'games.wordle.body',
    ways: [
      { labelKey: 'games.mode.solo', href: '/app/games/peyvok' },
      { labelKey: 'games.mode.online', href: '/app/games/peyvok-battle' },
    ],
    company: ['solo', 'friends'],
    ready: true,
  },
  {
    id: 'rhyme',
    nameKey: 'games.rhyme.name',
    lineKey: 'games.card.rhyme',
    bodyKey: 'games.rhyme.body',
    ways: [
      { labelKey: 'games.mode.solo', href: '/app/games/rhyme' },
      { labelKey: 'games.mode.online', href: '/app/games/rhyme-match' },
    ],
    company: ['solo', 'friends'],
    ready: true,
  },
  {
    id: 'race',
    nameKey: 'games.race.name',
    lineKey: 'games.card.race',
    bodyKey: 'games.race.body',
    ways: [{ labelKey: 'games.play', href: '/app/games/race' }],
    company: ['solo'],
    ready: true,
  },
];

/**
 * The game the page puts forward today: one of those that can be played,
 * a different one each day, the same one for everybody all day (pure, for the
 * tests). None while nothing can be played.
 */
export function featuredGame(games: readonly GameEntry[], now: number): GameEntry | null {
  const ready = games.filter((g) => g.ready);
  const today = gameOfTheDay(ready.length, now);
  return today === null ? null : ready[today]!;
}

/**
 * What each game's name means, said in the reader's language under it. A
 * game's name is Kurmancî in every language the app speaks ("Xapînok", not
 * "Impostor"), which teaches a word and tells a newcomer nothing: the line
 * under it does the telling. Peyvok is a made-up word and means only itself;
 * where the interface is Kurdish the meaning is the name again, and is not
 * said twice.
 */
const MEANING: Partial<Record<GameEmblem, MessageKey>> = {
  rhyme: 'games.rhyme.meaning',
  race: 'games.race.meaning',
  'memory-thief': 'games.memory.meaning',
  detective: 'games.detective.meaning',
  'last-letter': 'games.lastLetter.meaning',
  impostor: 'games.impostor.meaning',
  'who-am-i': 'games.whoAmI.meaning',
};

/** The colour a game's card takes at its edge under a hand: the game's own. The cover carries the colour; the buttons do not. */
const toneOf = (id: GameEmblem): React.CSSProperties => ({ '--gp-tone': gameEmblemTone(id) }) as React.CSSProperties;

/** Who a game is played with, said in small beside a single way in. */
function Company({ company }: { company: readonly Company[] }): React.JSX.Element {
  const t = useT();
  return (
    <ul className="gp-company">
      {company.map((c) => (
        <li key={c}>
          {c === 'solo' ? <UserIcon size={14} /> : <UsersIcon size={14} />}
          {t(c === 'solo' ? 'games.filter.solo' : 'games.filter.friends')}
        </li>
      ))}
    </ul>
  );
}

/**
 * A game's ways in. Signed in: one button for each page it has — Play the
 * same solid button on every card, the app's own, and a second way, where
 * there is one, the quiet button beside it. One Play everywhere, the colour
 * left to the covers: a shelf of differently coloured buttons looked like a
 * toy box, not like Hevalo. Signed out there is nothing to open — every game
 * keeps its score on the server against the player — so the one thing
 * offered is the way to an account.
 */
function Ways({ game, signedIn, large = false }: { game: GameEntry; signedIn: boolean; large?: boolean }): React.JSX.Element {
  const t = useT();
  const size = large ? '' : ' btn-sm';
  if (!signedIn) {
    return (
      <div className="gp-ways">
        <Link to="/login" state={{ from: '/app/games' }} className={`btn btn-secondary${size}`}>
          {t('games.signInToPlay')}
        </Link>
      </div>
    );
  }
  return (
    <div className="gp-ways">
      {game.ways.map((way, i) => (
        <Link key={way.href} to={way.href} className={`btn ${i === 0 ? 'btn-primary gp-play' : 'btn-secondary'}${size}`}>
          {t(way.labelKey)}
        </Link>
      ))}
    </div>
  );
}

/** One game: its cover, what it is, and its ways in. */
function GameCard({ game, signedIn, hero = false, place = 0 }: { game: GameEntry; signedIn: boolean; hero?: boolean; place?: number }): React.JSX.Element {
  const t = useT();
  // a hand on a shelf card — over it, on it, or the keyboard in it — plays its emblem through once more
  const [again, setAgain] = useState(0);
  const stir = hero ? undefined : (): void => setAgain((n) => n + 1);
  const name = t(game.nameKey);
  const meaningKey = MEANING[game.id];
  const meaning = meaningKey ? t(meaningKey) : null;
  return (
    <article className={`gp-card${hero ? ' gp-card--hero' : ''}`} style={toneOf(game.id)} onPointerEnter={stir} onPointerDown={stir} onFocus={stir}>
      <div className="gp-card-art">
        {/* the game put forward acts for as long as it is in view; on the shelf each cover plays through once as it
            arrives, a moment after the card before it, and then rests — one thing moving at a time, never the shelf */}
        {hero ? <GameArt game={game.id} size={164} moving /> : <GameArt game={game.id} size={104} moving="once" after={300 + place * 160} again={again} />}
      </div>
      <div className="gp-card-text">
        {hero && <p className="gp-kicker">{t('games.featured')}</p>}
        <h3 className="gp-card-name">{name}</h3>
        {meaning && meaning !== name && <p className="gp-card-meaning">{meaning}</p>}
        <p className="gp-card-body">{t(hero ? game.bodyKey : game.lineKey)}</p>
        {/* two pages say who each is for on their buttons; one page for both says it here */}
        {game.ways.length === 1 && <Company company={game.company} />}
        <Ways game={game} signedIn={signedIn} large={hero} />
      </div>
    </article>
  );
}

/**
 * Learn, on its Games group (/app/games).
 *
 * The page is a shelf, not a list of rules: the game put forward today at the
 * top, a way in for somebody holding a friend's code, then every game as one
 * card — its drawn emblem, a line about it, and a button for each way it is
 * played. Nothing on a card needs a second step: a game with a page for
 * playing alone and another for playing online has a button for each. There
 * is no filter: a handful of games, each saying who it is played with, is
 * read faster than a control that sorts them.
 *
 * Every game needs an account, the solo rounds included: the server keeps the
 * score against the player (every route in api/src/game asks who is playing).
 * A visitor sees every game and, on each, the way to sign in.
 *
 * A game that is still short of approved content in the learner's Kurdish is
 * not among the cards: it is named in a short row at the foot of the shelf,
 * so the shelf itself only ever holds what can be opened.
 *
 * The stories have a group of their own (Learn → Stories): reading is not a
 * game, and the questions after a story are reached from the story.
 */
export function Games(): React.JSX.Element {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const t = useT();
  // the learning games (games/learnGames.tsx): all of them, each with whether it can be played yet
  const learnGames = useListedLearnGames();

  const games = useMemo<GameEntry[]>(
    () => [
      ...CLASSICS,
      ...learnGames.flatMap(({ game, ready }): GameEntry[] => {
        const web = WEB_LEARN_GAMES[game.id];
        if (!web) return [];
        return [
          {
            id: game.id as GameEmblem,
            nameKey: web.nameKey,
            lineKey: web.lineKey,
            bodyKey: web.bodyKey,
            ways: [{ labelKey: 'games.play', href: web.href }],
            company: web.modes.map((m) => (m === 'solo' ? 'solo' : 'friends')),
            ready,
          },
        ];
      }),
    ],
    [learnGames],
  );
  const open = games.filter((g) => g.ready);
  const soon = games.filter((g) => !g.ready);
  // the game put forward stands above the shelf, and is not said twice on it
  const featured = featuredGame(games, Date.now());
  const shelf = open.filter((g) => g !== featured);

  return (
    <div className="container game-page gp">
      <LearnHeader view="games" />
      <h2 className="sr-only">{t('games.title')}</h2>

      {featured && <GameCard game={featured} signedIn={signedIn} hero />}

      <div className="gp-quick">
        {/* a friend's code, into their game: one way in for every online game, where somebody holding a code looks first */}
        <JoinCodeEntry />
        {/* the leagues and the season, from the games they are about */}
        <Link to="/app/rankings" className="games-rankings">
          <TrophyIcon size={20} />
          <span className="games-rankings-text">
            <span className="games-rankings-title">{t('nav.rankings')}</span>
            <span className="games-rankings-sub">{t('learn.rankingsSub')}</span>
          </span>
          <ChevronIcon size={16} className="games-rankings-go" />
        </Link>
      </div>

      <div className="gp-shelf">
        {shelf.map((g, i) => (
          <GameCard key={g.id} game={g} signedIn={signedIn} place={i} />
        ))}
      </div>

      {soon.length > 0 && (
        <section className="gp-soon" aria-labelledby="gp-soon-title">
          <h2 id="gp-soon-title" className="gp-soon-title">
            {t('games.comingSoon')}
          </h2>
          <ul className="gp-soon-list">
            {soon.map((g) => (
              <li key={g.id}>
                <article className="gp-soon-item is-soon" style={toneOf(g.id)}>
                  <GameArt game={g.id} size={40} />
                  <h3 className="gp-soon-name">{t(g.nameKey)}</h3>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* your rank in each game played against people, and the season (signed in only) */}
      <RanksSection />

      {!signedIn && (
        <div className="cta" style={{ marginTop: 40 }}>
          <h2 className="h-section">{t('games.playAndScore')}</h2>
          <p>{t('games.cta.body')}</p>
          <LinkButton to="/register" size="lg">
            {t('auth.register.title')}
          </LinkButton>
        </div>
      )}
    </div>
  );
}
