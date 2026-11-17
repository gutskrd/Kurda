import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameEmblemHue, gameOfTheDay, type GameEmblem } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
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
  /** one line about it: said with its stamp to a screen reader, which sees no cover */
  lineKey: MessageKey;
  /** what it is, said in full where there is room: under the stamp put forward, and where a game's ways in are offered */
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

type Translate = ReturnType<typeof useT>;

/** What a game's name means in the reader's language, or null where there is nothing to add to the name. */
function meaningOf(game: GameEntry, t: Translate): string | null {
  const key = MEANING[game.id];
  const meaning = key ? t(key) : null;
  return meaning && meaning !== t(game.nameKey) ? meaning : null;
}

/**
 * Between two stamps, across and down: room for each one's light to all but
 * fade before the next one's begins (the light reaches 16 from a stamp's
 * edge), so a row is stamps side by side and not one band of colour.
 */
const STAMP_GAP = 28;
/** A stamp on the shelf at its widest, and the narrowest it gets before the shelf takes one fewer to a row instead. */
const STAMP_WIDEST = 200;
const STAMP_NARROWEST = 168;
/**
 * The stamp put forward today: the phone app's width on a phone, and about a
 * third wider than a stamp on the shelf as those grow with the page, so it
 * stays the one that stands out. It keeps air on either side of it on the
 * narrowest screen.
 */
const HERO_STAMP = 228;
const HERO_TO_SHELF = 1.35;
const HERO_AIR = 32;
/** The least room the stamps are laid out for. A page narrower still is cut at its edges, not squeezed until a stamp has no width left to draw. */
const LEAST_ROOM = 240;
/** The room a page has on a narrow phone, 320 across less its gutters: the guess where a window will not say how wide it is. */
const PHONE_ROOM = 288;
/** The page's column at its widest, and the gutters beside it (`--container` in styles/tokens.css, `.container` in styles/base.css). */
const COLUMN = 1120;
const GUTTER = { phone: 16, wide: 24, phoneUpTo: 640 } as const;

/**
 * How the stamps are laid out in the room the page has (pure, for the tests):
 * how many stand to a row on the shelf, how wide each of them is, and how wide
 * the one put forward is. Two to a row on a phone, each as wide as half the
 * page allows; more as the page widens, as many as fit without any getting
 * narrower than `STAMP_NARROWEST`. A stamp never grows past `STAMP_WIDEST`:
 * wider than that it is a poster, and a row with room to spare stands in the
 * middle of the page.
 */
export function shelfLayout(across: number): { columns: number; width: number; hero: number } {
  const room = Math.max(LEAST_ROOM, across);
  const columns = Math.max(2, Math.floor((room + STAMP_GAP) / (STAMP_NARROWEST + STAMP_GAP)));
  const width = Math.min(STAMP_WIDEST, Math.floor((room - STAMP_GAP * (columns - 1)) / columns));
  return { columns, width, hero: Math.min(Math.max(HERO_STAMP, Math.round(width * HERO_TO_SHELF)), room - HERO_AIR * 2) };
}

/** The room the page would have by the window alone: a guess to draw the first time with, until the page has been measured. */
function roomFromWindow(): number {
  const across = typeof window === 'undefined' ? 0 : window.innerWidth;
  if (!(across > 0)) return PHONE_ROOM;
  return Math.min(across, COLUMN) - (across <= GUTTER.phoneUpTo ? GUTTER.phone : GUTTER.wide) * 2;
}

/**
 * The room the page's column has for stamps, and the ref of the box it is
 * measured on.
 *
 * A stamp's outline is drawn for its width — its perforations are counted
 * out along each edge — so the width has to be known here, not left to the
 * stylesheet. It is guessed from the window for the first drawing and
 * measured before that drawing is shown (a side rail, a scrollbar and the
 * page's own gutters all take room the window does not know of), so the
 * shelf never appears at one size and changes to another. After that it
 * follows the box as the window is resized. Where nothing can be measured —
 * a browser without the observer, or no layout at all, which reports a width
 * of nothing — the guess stands.
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
 * A game's ways in, as buttons: under the stamp put forward, and in the
 * dialog a stamp with two ways opens. One button for each page the game has,
 * the first the app's own solid button and a second way the quiet one beside
 * it: the stamps carry the colour, and the buttons stay one calm thing to
 * press. Signed out there is nothing to open — every game keeps its score on
 * the server against the player — so the one thing offered is the way to an
 * account.
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
        // said with the game's name, as the other way beside it is: "Play" alone, read out of its place on the page, names no game
        <Link key={way.href} to={way.href} className={`btn btn-lg ${i === 0 ? 'btn-primary' : 'btn-secondary'}`} aria-label={`${name}, ${t(way.labelKey)}`}>
          {t(way.labelKey)}
        </Link>
      ))}
    </div>
  );
}

/**
 * One game as a stamp that is pressed: the stamp (games/GameStamp.tsx), and
 * laid over the whole of it the one thing a press does.
 *
 * A game with one way in is a link to its page. A game with two — alone or
 * against somebody — is a button that opens a dialog offering each (`onOffer`),
 * since two buttons do not fit on a stamp, and a shelf with half its stamps
 * carrying buttons was a list of buttons. Signed out, every stamp leads to
 * signing in, and says so: no game can be started without an account.
 *
 * The stamp itself is a picture with a heading, and what is pressed is beside
 * it, not around it: a heading inside a button is no heading to a screen
 * reader. What is pressed says the game, who it is played with and what you
 * do in it, which a reader who cannot see the cover has no other way to learn
 * from a stamp.
 *
 * `settled` says the shelf has its final shape. Until the learning games have
 * been counted the page holds only the three that are always here, and which
 * of them is put forward changes when the rest arrive: a stamp is somewhere
 * for a cover to come back to only once it is where it will stay.
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
  // a hand on a shelf stamp — over it, on it, or the keyboard on it — plays its cover through once more
  const [again, setAgain] = useState(0);
  const stir = large ? undefined : (): void => setAgain((n) => n + 1);
  const name = t(game.nameKey);
  const meaning = meaningOf(game, t);
  // the cover goes with the reader into the game: pressed, it becomes the picture at the head of the game's page, and comes
  // back from there to this stamp (lib/viewTransition.tsx). The stamp put forward has its ways in under it, and they carry
  // the cover too. A visitor's press leads to signing in, where no cover is waited for.
  const cover = useGrowsFrom(settled && signedIn ? `game:${game.id}` : null, { within: large ? '.gp-featured' : '.gp-stamp' });
  const company = game.company.map((c) => t(c === 'solo' ? 'games.filter.solo' : 'games.filter.friends')).join(', ');
  const said = `${name}, ${company}. ${t(game.lineKey)}`;
  return (
    // it wears the game's hue as the stamp inside it does: the keyboard's ring round what is pressed is drawn in it (games-page.css)
    <article className={`gp-stamp hue-${gameEmblemHue(game.id)}`} onPointerEnter={stir} onPointerDown={stir} onFocus={stir}>
      {/* the game put forward acts for as long as it is in view; on the shelf each cover plays through once as it
          arrives, a moment after the stamp before it, and then rests — one thing moving at a time, never the shelf */}
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

/**
 * What the dialog of a game with more than one way in holds: the cover, the
 * game's name and what it means, what the game is, said in full, and a button
 * for each way. A way pressed takes the cover with it to the game's page, as
 * a stamp that is a link does.
 */
function Offer({ game }: { game: GameEntry }): React.JSX.Element {
  const t = useT();
  const meaning = meaningOf(game, t);
  const cover = useGrowsFrom(`game:${game.id}`, { within: '.gp-offer' });
  return (
    <div className="gp-offer">
      {/* alone in front of the reader, so it acts for as long as it is seen */}
      <GameArt game={game.id} size={112} moving ref={cover} />
      {/* in its own direction, as on its stamp */}
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
 * Learn, on its Games group (/app/games).
 *
 * Every game is a stamp (games/GameStamp.tsx): its drawn cover on paper of
 * its own hue, its Kurdish name, and what the name means. The page is the
 * phone app's (mobile/src/learn/GamesView.tsx) with a website's room: the
 * game put forward today as one large stamp in the middle of the page, what
 * it is under it and its ways in under that, one press from here; a way in
 * for somebody holding a friend's code, and the way to the rankings; then
 * every other game on a shelf of stamps, two to a row on a phone and more as
 * the page widens, like a page of a collection. A stamp with one way in opens
 * its game; a stamp with two opens a dialog that says what the game is and
 * offers each. There is no filter: a handful of games is read faster than a
 * control that sorts them.
 *
 * Every game needs an account, the solo rounds included: the server keeps the
 * score against the player (every route in api/src/game asks who is playing).
 * A visitor sees every game, and is told where the stamps begin what a press
 * will ask of them; every stamp, and the one button the page has, leads
 * there: to signing in.
 *
 * A game that is still short of approved content in the learner's Kurdish is
 * not among the stamps: it is named in a short row at the foot of the shelf,
 * so the shelf itself only ever holds what can be opened.
 *
 * The stories have a group of their own (Learn → Stories): reading is not a
 * game, and the questions after a story are reached from the story.
 */
export function Games(): React.JSX.Element {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const t = useT();
  // the game whose ways in are being offered, while its dialog is up
  const [offered, setOffered] = useState<GameEntry | null>(null);
  // a session that ends takes the offer with it, so it is not standing open again when somebody next signs in
  if (!signedIn && offered) setOffered(null);
  const [shelfBox, room] = useRoom();
  const { columns, width, hero } = shelfLayout(room);
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
  // nothing of the learning games is listed until they have been counted, and then all of them are, ready or not
  const settled = learnGames.length > 0;
  // the game put forward stands above the shelf, and is not said twice on it
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

      {/* how many stamps stand to a row, how wide each is and how far apart: counted out here, and laid out by the stylesheet */}
      <section
        className="gp-games"
        aria-labelledby="gp-games-label"
        style={{ '--gp-columns': columns, '--gp-stamp': `${width}px`, '--gp-stamp-gap': `${STAMP_GAP}px` } as React.CSSProperties}
      >
        <div className="gp-games-head">
          <h2 id="gp-games-label" className="gp-label">
            {t('games.title')}
          </h2>
          {/* said once, where the stamps begin: a visitor's press on any of them leads to signing in */}
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

      {/* the ways into a game that has two; it grows out of the stamp that was pressed (components/Modal.tsx) */}
      <Modal open={offered !== null} onClose={() => setOffered(null)} label={offered ? t(offered.nameKey) : ''}>
        {offered && <Offer game={offered} />}
      </Modal>
    </div>
  );
}
