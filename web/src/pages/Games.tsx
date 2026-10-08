import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthProvider';
import { QuizMini, RaceMini, RhymeMini, WordleMini } from '../landing/mocks';

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
  id: 'wordle' | 'rhyme' | 'race' | 'quiz';
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
      { labelKey: 'games.mode.solo', blurbKey: 'games.wordle.solo', href: '/app/games/wordle' },
      { labelKey: 'games.mode.online', blurbKey: 'games.wordle.online', href: '/app/games/wordle-battle' },
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
  {
    id: 'quiz',
    visual: <QuizMini />,
    nameKey: 'games.quiz.name',
    bodyKey: 'games.quiz.body',
    modes: [
      { labelKey: 'games.mode.online', blurbKey: 'games.quiz.online', href: '/app/games/quiz' },
    ],
  },
];

/**
 * Games overview. Every game is one box; clicking it asks how you want to play
 * (solo vs online) instead of scattering each mode across its own card. All
 * games are server-authoritative — the client never scores itself.
 *
 * Which is also why every game needs an account, the solo rounds included:
 * the server keeps the score against the player (every route in api/src/game
 * asks who is playing). This page used to offer guests the solo modes, and a
 * guest who took the offer got an error instead of a game. Now a guest sees
 * every game, every mode marked as needing an account, and the way to make one.
 */
export function Games(): React.JSX.Element {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const [chooser, setChooser] = useState<GameCard | null>(null);
  const t = useT();

  return (
    <div className="container game-page">
      <div className="page-header">
        <span className="eyebrow">{t('games.eyebrow')}</span>
        <h1 className="page-title">{t('games.title')}</h1>
        <p className="page-sub">{t('games.subtitle')}</p>
      </div>

      {/* the front page's tiles, with the real ways in: the same pictures, the same grid */}
      <div className="game-grid">
        {GAMES.map((g) => {
          // nothing is playable without an account (see the note above)
          const playable = signedIn ? g.modes : [];
          const single = playable.length === 1 ? playable[0] : undefined;
          return (
            <article className={`game-tile game-tile--${g.id}`} key={g.nameKey}>
              <div className="game-tile-visual">{g.visual}</div>
              <div className="game-tile-text">
                <div className="game-tile-head">
                  <h3>{t(g.nameKey)}</h3>
                  <span className={`badge${playable.length > 0 ? ' badge-gold' : ''}`}>
                    {playable.length > 0 ? t('games.playable') : t('games.signInToPlay')}
                  </span>
                </div>
                <p>{t(g.bodyKey)}</p>
                <ul className="game-tags">
                  {g.modes.map((m) => {
                    const locked = !signedIn;
                    return (
                      <li key={m.href} className={locked ? 'is-locked' : undefined}>
                        {t(m.labelKey)}
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
      </div>

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
