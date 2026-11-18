import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameEmblemHue, gameOfTheDay, type GameEmblem } from '@kurda/shared';
import { useT, type Translate } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { LinkButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthProvider';
import { RanksSection } from '../ranks/RanksSection';
import { LearnHeader } from '../learn/LearnHeader';
import { ChevronIcon, TrophyIcon } from '../components/icons';
import { JoinCodeEntry } from '../play/JoinCode';
import { WEB_LEARN_GAMES, useListedLearnGames } from '../games/learnGames';
import { GameArt } from '../games/GameArt';
import { GameStamp } from '../games/GameStamp';
import { useGrowsFrom } from '../lib/viewTransition';
import '../games/games-page.css';

/** Who a game is played with, said with its stamp. */
type Company = 'solo' | 'friends';

/** A game as the page lists it, with catalogue keys resolved at render, since the list is built once at module load. */
export interface GameEntry {
  id: GameEmblem;
  nameKey: MessageKey;
  /** One line about it, read with its stamp to a screen reader, which sees no cover. */
  lineKey: MessageKey;
  /** What it is in full, under the featured stamp and wherever its ways in are offered. */
  bodyKey: MessageKey;
  /** Its ways in, one per page it has; a game whose page asks how to play has one. */
  ways: ReadonlyArray<{ labelKey: MessageKey; href: string }>;
  company: readonly Company[];
  /** False while it lacks approved content: listed, but not opened. */
  ready: boolean;
}

/** The three original games, each with its own pages, rules and tables (see games/registry.ts). */
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

/** Today's featured game: one of the playable ones, a different one each day and the same for everyone; none when nothing is playable. */
export function featuredGame(games: readonly GameEntry[], now: number): GameEntry | null {
  const ready = games.filter((g) => g.ready);
  const today = gameOfTheDay(ready.length, now);
  return today === null ? null : ready[today]!;
}

/**
 * What each game's name means, in the reader's language. Names are Kurmancî everywhere ("Xapînok", not "Impostor"), so
 * the line explains them; Peyvok means only itself, and in a Kurdish interface the meaning is not repeated.
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

/** What a game's name means in the reader's language, or null when there is nothing to add. */
function meaningOf(game: GameEntry, t: Translate): string | null {
  const key = MEANING[game.id];
  const meaning = key ? t(key) : null;
  return meaning && meaning !== t(game.nameKey) ? meaning : null;
}

/** The gap between stamps: room for each one's light (16 from its edge) to fade before the next begins. */
const STAMP_GAP = 28;
/** A shelf stamp at its widest, and the narrowest before the shelf drops one per row. */
const STAMP_WIDEST = 200;
const STAMP_NARROWEST = 168;
/** The featured stamp: the phone app's width on a phone, about a third wider than shelf stamps as they grow, with air either side. */
const HERO_STAMP = 228;
const HERO_TO_SHELF = 1.35;
const HERO_AIR = 32;
/** The least room the stamps are laid out for; a narrower page is cut at its edges rather than squeezed. */
const LEAST_ROOM = 240;
/** A 320px phone's room less its gutters, the guess when the window will not say how wide it is. */
const PHONE_ROOM = 288;
/** The page's widest column and its gutters (`--container` in styles/tokens.css, `.container` in styles/base.css). */
const COLUMN = 1120;
const GUTTER = { phone: 16, wide: 24, phoneUpTo: 640 } as const;

/**
 * How stamps are laid out in the page's room: how many per row, each one's width, and the featured stamp's width. Two to
 * a row on a phone, more as the page widens without any going below `STAMP_NARROWEST`; never wider than `STAMP_WIDEST`,
 * with a short row centred.
 */
export function shelfLayout(across: number): { columns: number; width: number; hero: number } {
  const room = Math.max(LEAST_ROOM, across);
  const columns = Math.max(2, Math.floor((room + STAMP_GAP) / (STAMP_NARROWEST + STAMP_GAP)));
  const width = Math.min(STAMP_WIDEST, Math.floor((room - STAMP_GAP * (columns - 1)) / columns));
  return { columns, width, hero: Math.min(Math.max(HERO_STAMP, Math.round(width * HERO_TO_SHELF)), room - HERO_AIR * 2) };
}

/** The page's room judged from the window alone, for the first draw before measuring. */
function roomFromWindow(): number {
  const across = typeof window === 'undefined' ? 0 : window.innerWidth;
  if (!(across > 0)) return PHONE_ROOM;
  return Math.min(across, COLUMN) - (across <= GUTTER.phoneUpTo ? GUTTER.phone : GUTTER.wide) * 2;
}

/**
 * The room the page's column has for stamps, and the ref of the measured box. A stamp's perforations are counted out for
 * its width, so it must be known here: guessed from the window, measured before the first draw is shown so the shelf
 * never changes size, then followed on resize. Without an observer or layout the guess stands.
 */
function useRoom(): [React.RefObject<HTMLDivElement | null>, number] {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(roomFromWindow);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (): void => {
      const across = el.clientWidth;
      if (across > 0) setRoom(across);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const watching = new ResizeObserver(measure);
    watching.observe(el);
    return () => watching.disconnect();
  }, []);
  return [box, room];
}

/**
 * A game's ways in as buttons, under the featured stamp and in a two-way stamp's dialog: the first solid, a second
 * quiet. Signed out, every game needs an account for its score, so the one button leads to signing in.
 */
function Ways({ game, signedIn }: { game: GameEntry; signedIn: boolean }): React.JSX.Element {
  const t = useT();
  if (!signedIn) {
    return (
      <div className="gp-ways">
        <Link to="/login" state={{ from: '/app/games' }} className="btn btn-primary btn-lg">
          {t('games.signInToPlay')}
        </Link>
      </div>
    );
  }
  const name = t(game.nameKey);
  return (
    <div className="gp-ways">
      {game.ways.map((way, i) => (
        // Named with the game, since "Play" alone names no game.
        <Link key={way.href} to={way.href} className={`btn btn-lg ${i === 0 ? 'btn-primary' : 'btn-secondary'}`} aria-label={`${name}, ${t(way.labelKey)}`}>
          {t(way.labelKey)}
        </Link>
      ))}
    </div>
  );
}

/**
 * One game as a pressable stamp (games/GameStamp.tsx) with the press laid over it: a link for one way in, or a button
 * opening a dialog of both ways (`onOffer`); signed out, it leads to signing in and says so. The press sits beside the
 * stamp, not around it, since a heading inside a button is no heading to a screen reader, and its label names the game,
 * who it is played with and what you do. `settled` says the shelf has its final shape, so a cover can travel back to it.
 */
function Stamp({
  game,
  width,
  signedIn,
  settled,
  onOffer,
  large = false,
  place = 0,
}: {
  game: GameEntry;
  width: number;
  signedIn: boolean;
  settled: boolean;
  onOffer: (game: GameEntry) => void;
  large?: boolean;
  place?: number;
}): React.JSX.Element {
  const t = useT();
  // Hovering, pressing or focusing a shelf stamp replays its cover once.
  const [again, setAgain] = useState(0);
  const stir = large ? undefined : (): void => setAgain((n) => n + 1);
  const name = t(game.nameKey);
  const meaning = meaningOf(game, t);
  // The cover travels to the game page's head and back (lib/viewTransition.tsx); the featured stamp's buttons carry it
  // too. A visitor's press leads to signing in, where no cover is waited for.
  const cover = useGrowsFrom(settled && signedIn ? `game:${game.id}` : null, { within: large ? '.gp-featured' : '.gp-stamp' });
  const company = game.company.map((c) => t(c === 'solo' ? 'games.filter.solo' : 'games.filter.friends')).join(', ');
  const said = `${name}, ${company}. ${t(game.lineKey)}`;
  return (
    // It wears the game's hue like its stamp, so the keyboard's focus ring is drawn in it (games-page.css).
    <article className={`gp-stamp hue-${gameEmblemHue(game.id)}`} onPointerEnter={stir} onPointerDown={stir} onFocus={stir}>
      {/* The featured game moves while in view; each shelf cover plays once as it arrives, staggered, then rests. */}
      {large ? (
        <GameStamp game={game.id} name={name} meaning={meaning} width={width} large moving coverRef={cover} />
      ) : (
        <GameStamp game={game.id} name={name} meaning={meaning} width={width} moving="once" after={300 + place * 160} again={again} coverRef={cover} />
      )}
      {!signedIn ? (
        <Link to="/login" state={{ from: '/app/games' }} className="gp-stamp-press" aria-label={`${said} ${t('games.signInToPlay')}`} />
      ) : game.ways.length === 1 ? (
        <Link to={game.ways[0]!.href} className="gp-stamp-press" aria-label={said} />
      ) : (
        <button type="button" className="gp-stamp-press" aria-haspopup="dialog" aria-label={said} onClick={() => onOffer(game)} />
      )}
    </article>
  );
}

/** A two-way game's dialog: the cover, name and meaning, what the game is, and a button per way, each carrying the cover. */
function Offer({ game }: { game: GameEntry }): React.JSX.Element {
  const t = useT();
  const meaning = meaningOf(game, t);
  const cover = useGrowsFrom(`game:${game.id}`, { within: '.gp-offer' });
  return (
    <div className="gp-offer">
      {/* Alone in front of the reader, so it moves while seen. */}
      <GameArt game={game.id} size={112} moving ref={cover} />
      {/* In its own direction, as on its stamp. */}
      <h2 className="gp-offer-name" dir="auto">
        {t(game.nameKey)}
      </h2>
      {meaning && (
        <p className="gp-offer-meaning" dir="auto">
          {meaning}
        </p>
      )}
      <p className="gp-offer-body">{t(game.bodyKey)}</p>
      <Ways game={game} signedIn />
    </div>
  );
}

/**
 * Learn's Games group (/app/games), as on the phone (mobile/src/learn/GamesView.tsx) with more room: today's game as a
 * large featured stamp with its ways in, the code entry and rankings, then every other game on a shelf of stamps. A
 * one-way stamp opens its game; a two-way one opens a dialog. There is no filter.
 *
 * Every game needs an account, since the server scores against the player; visitors see every game and are told once
 * that a press leads to signing in. Games still short of content are named in a row at the foot, so the shelf holds only
 * what opens. Stories have their own group.
 */
export function Games(): React.JSX.Element {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const t = useT();
  // The game whose ways in are offered, while its dialog is up.
  const [offered, setOffered] = useState<GameEntry | null>(null);
  // A session ending closes the offer, so it is not open again on the next sign-in.
  if (!signedIn && offered) setOffered(null);
  const [shelfBox, room] = useRoom();
  const { columns, width, hero } = shelfLayout(room);
  // The learning games (games/learnGames.tsx), each with whether it can be played yet.
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
  // No learning game is listed until all have been counted, then all are, ready or not.
  const settled = learnGames.length > 0;
  // The featured game stands above the shelf and is not repeated on it.
  const featured = featuredGame(games, Date.now());
  const shelf = open.filter((g) => g !== featured);

  return (
    <div className="container game-page gp">
      <LearnHeader view="games" />

      {featured && (
        <section className="gp-featured" aria-labelledby="gp-featured-label">
          <h2 id="gp-featured-label" className="gp-label">
            {t('games.featured')}
          </h2>
          <Stamp key={featured.id} game={featured} width={hero} signedIn={signedIn} settled={settled} onOffer={setOffered} large />
          <p className="gp-featured-body">{t(featured.bodyKey)}</p>
          <Ways game={featured} signedIn={signedIn} />
        </section>
      )}

      <div className="gp-quick">
        {/* A friend's code into their game: one way in for every online game. */}
        <JoinCodeEntry />
        {/* The leagues and the season. */}
        <Link to="/app/rankings" className="games-rankings">
          <TrophyIcon size={20} />
          <span className="games-rankings-text">
            <span className="games-rankings-title">{t('nav.rankings')}</span>
            <span className="games-rankings-sub">{t('learn.rankingsSub')}</span>
          </span>
          <ChevronIcon size={16} className="games-rankings-go" />
        </Link>
      </div>

      {/* Stamps per row, their width and gap are counted here and laid out by the stylesheet. */}
      <section
        className="gp-games"
        aria-labelledby="gp-games-label"
        style={{ '--gp-columns': columns, '--gp-stamp': `${width}px`, '--gp-stamp-gap': `${STAMP_GAP}px` } as React.CSSProperties}
      >
        <div className="gp-games-head">
          <h2 id="gp-games-label" className="gp-label">
            {t('games.title')}
          </h2>
          {/* Said once, where the stamps begin: a visitor's press leads to signing in. */}
          {!signedIn && (
            <Link to="/login" state={{ from: '/app/games' }} className="gp-signin">
              {t('games.signInToPlay')}
              <ChevronIcon size={14} className="gp-signin-go" />
            </Link>
          )}
        </div>
        <div ref={shelfBox} className="gp-shelf">
          {shelf.map((g, i) => (
            <Stamp key={g.id} game={g} width={width} signedIn={signedIn} settled={settled} onOffer={setOffered} place={i} />
          ))}
        </div>
      </section>

      {soon.length > 0 && (
        <section className="gp-soon" aria-labelledby="gp-soon-title">
          <h2 id="gp-soon-title" className="gp-label">
            {t('games.comingSoon')}
          </h2>
          <ul className="gp-soon-list">
            {soon.map((g) => (
              <li key={g.id}>
                <article className="gp-soon-item is-soon">
                  <GameArt game={g.id} size={40} />
                  <h3 className="gp-soon-name" dir="auto">
                    {t(g.nameKey)}
                  </h3>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Your rank in each game played against people, and the season (signed in only). */}
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

      {/* The ways into a two-way game, growing out of the pressed stamp (components/Modal.tsx). */}
      <Modal open={offered !== null} onClose={() => setOffered(null)} label={offered ? t(offered.nameKey) : ''}>
        {offered && <Offer game={offered} />}
      </Modal>
    </div>
  );
}
