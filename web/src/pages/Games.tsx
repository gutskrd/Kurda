import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthProvider';
import { RaceMini, RhymeMini, WordleMini } from '../landing/mocks';
import { RanksSection } from '../ranks/RanksSection';
import { LearnHeader } from '../learn/LearnHeader';
import { ChevronIcon, TrophyIcon } from '../components/icons';
import { JoinCodeEntry } from '../play/JoinCode';
import { LearnGameTile, useListedLearnGames } from '../games/learnGames';
import { KingdomTile } from '../kingdom/KingdomEntry';

/**
 * A game, before it has words.
 *
 * Keys rather than text, resolved at render: this array is built once when the
 * module loads, so a label baked in here would keep whichever language the app
 * happened to start in even after somebody changed it.
 */
interface GameMode {
  labelKey: MessageKey;
  blurbKey: MessageKey;
  href: string;
}

interface GameCard {
  /** the tile's shape in the grid, shared with the front page */
  id: 'wordle' | 'rhyme' | 'race';
  /** a small picture of the game being played — the front page's, decorative */
  visual: React.JSX.Element;
  nameKey: MessageKey;
  bodyKey: MessageKey;
  /** how this game can be played; one box per game, the mode is chosen on click */
  modes: GameMode[];
}

/** One box per game — the mode (solo / online / …) is chosen after clicking. */
const GAMES: GameCard[] = [
  {
    id: 'wordle',
    visual: <WordleMini />,
    nameKey: 'games.wordle.name',
    bodyKey: 'games.wordle.body',
    modes: [
      { labelKey: 'games.mode.solo', blurbKey: 'games.wordle.solo', href: '/app/games/peyvok' },
      { labelKey: 'games.mode.online', blurbKey: 'games.wordle.online', href: '/app/games/peyvok-battle' },
    ],
  },
  {
    id: 'rhyme',
    visual: <RhymeMini />,
    nameKey: 'games.rhyme.name',
    bodyKey: 'games.rhyme.body',
    modes: [
      { labelKey: 'games.mode.solo', blurbKey: 'games.rhyme.solo', href: '/app/games/rhyme' },
      { labelKey: 'games.mode.online', blurbKey: 'games.rhyme.online', href: '/app/games/rhyme-match' },
    ],
  },
  {
    id: 'race',
    visual: <RaceMini />,
    nameKey: 'games.race.name',
    bodyKey: 'games.race.body',
    modes: [
      {
        labelKey: 'games.race.mode',
        blurbKey: 'games.race.blurb',
        href: '/app/games/race',
      },
    ],
  },
];

/**
 * Learn, on its Games group (/app/games). Every game is one box; clicking it asks how you want to play
 * (solo vs online) instead of scattering each mode across its own card. All
 * games are server-authoritative — the client never scores itself.
 *
 * Which is also why every game needs an account, the solo rounds included:
 * the server keeps the score against the player (every route in api/src/game
 * asks who is playing). This page used to offer guests the solo modes, and a
 * guest who took the offer got an error instead of a game. Now a guest sees
 * every game, every mode marked as needing an account, and the way to make one.
 *
 * A friend's game is joined from here too, by the code they read out or sent
 * ("Join with a code", play/JoinCode.tsx): one way in for every online game,
 * at the top of the page where somebody holding a code looks first.
 *
 * The stories, which replaced the ranked quiz here, have a group of their own
 * now (Learn → Stories, stories/StoriesLibrary.tsx): reading is not a game,
 * and the questions after a story are reached from the story.
 */
export function Games(): React.JSX.Element {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const [chooser, setChooser] = useState<GameCard | null>(null);
  const t = useT();
  // the learning games (games/learnGames.tsx): each one only once it has enough approved content in the learner's Kurdish
  const learnGames = useListedLearnGames();

  return (
    <div className="container game-page">
      <LearnHeader view="games" />

      {/*
        Rankings, small and first: the way to the leagues and the season from
        the games they are about. Invites from friends are not repeated here —
        they arrive as the banner above every page, this one included, where
        they can be answered at once.
      */}
      <Link to="/app/rankings" className="games-rankings">
        <TrophyIcon size={20} />
        <span className="games-rankings-text">
          <span className="games-rankings-title">{t('nav.rankings')}</span>
          <span className="games-rankings-sub">{t('learn.rankingsSub')}</span>
        </span>
        <ChevronIcon size={16} className="games-rankings-go" />
      </Link>

      {/* a friend's code, into their game: any of the three online games */}
      <JoinCodeEntry />

      {/* the front page's tiles, with the real ways in: the same pictures, the same grid */}
      <h2 className="sr-only">{t('games.title')}</h2>
      <div className="game-grid">
        {GAMES.map((g) => {
          // nothing is playable without an account (see the note above)
          const playable = signedIn ? g.modes : [];
          const single = playable.length === 1 ? playable[0] : undefined;
          /*
           * A badge only when it tells you something: what a visitor can do
           * without an account. "Playable" on every card of a signed-in player
           * said nothing the Play button did not, in the gold that is kept for
           * what is earned.
           */
          const badge = signedIn ? null : t('games.signInToPlay');
          // each mode its own way in, when each has its own page
          const direct = playable.length > 1;
          return (
            <article className={`game-tile game-tile--${g.id}`} key={g.nameKey}>
              <div className="game-tile-visual">{g.visual}</div>
              <div className="game-tile-text">
                <div className="game-tile-head">
                  <h3>{t(g.nameKey)}</h3>
                  {badge && <span className={`badge${playable.length > 0 ? ' badge-gold' : ''}`}>{badge}</span>}
                </div>
                <p>{t(g.bodyKey)}</p>
                <ul className="game-tags">
                  {g.modes.map((m) => {
                    const locked = !signedIn;
                    return (
                      <li key={m.labelKey} className={locked ? 'is-locked' : direct ? 'is-link' : undefined}>
                        {/* straight into the game: Learn opens on Games for somebody who plays,
                            so this is the second tap from anywhere, not the fourth */}
                        {direct ? (
                          <Link to={m.href} className="game-tag-link">
                            {t(m.labelKey)}
                          </Link>
                        ) : (
                          t(m.labelKey)
                        )}
                        {locked && <span className="mode-locked"> · {t('games.mode.needsAccount')}</span>}
                      </li>
                    );
                  })}
                </ul>
                {playable.length > 0 &&
                  (single ? (
                    <Link to={single.href} className="btn btn-primary btn-sm">
                      {t('games.play')}
                    </Link>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setChooser(g)}>
                      {t('games.play')}
                    </button>
                  ))}
              </div>
            </article>
          );
        })}
        {learnGames.map((g) => (
          <LearnGameTile key={g.id} game={g} signedIn={signedIn} />
        ))}
        {/* The Village: the learner's own village, so only for someone signed in */}
        {signedIn && <KingdomTile />}
      </div>

      {/* your rank in each game played against people, and the season (signed in only) */}
      <RanksSection />

      <Modal open={chooser !== null} onClose={() => setChooser(null)} label={chooser ? t('games.howToPlay') : t('games.chooseMode')}>
        {chooser && (
          <div className="mode-chooser">
            <h2 className="friend-heading" style={{ marginTop: 0 }}>{t(chooser.nameKey)}</h2>
            <p className="muted">{t('games.howToPlay')}</p>
            <div className="mode-list">
              {chooser.modes.map((m) => (
                <Link key={m.href} to={m.href} className="mode-option" onClick={() => setChooser(null)}>
                  <span className="mode-option-label">{t(m.labelKey)}</span>
                  <span className="mode-option-blurb">{t(m.blurbKey)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Modal>

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
