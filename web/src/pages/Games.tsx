import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { FeatherIcon, BookIcon, KeyboardIcon, TrophyIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';

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
  /** played against other people, so it needs an account */
  online?: boolean;
}

interface GameCard {
  icon: React.JSX.Element;
  nameKey: MessageKey;
  bodyKey: MessageKey;
  /** how this game can be played; one box per game, the mode is chosen on click */
  modes: GameMode[];
}

/** One box per game — the mode (solo / online / …) is chosen after clicking. */
const GAMES: GameCard[] = [
  {
    icon: <BookIcon />,
    nameKey: 'games.wordle.name',
    bodyKey: 'games.wordle.body',
    modes: [
      { labelKey: 'games.mode.solo', blurbKey: 'games.wordle.solo', href: '/app/games/wordle' },
      { labelKey: 'games.mode.online', blurbKey: 'games.wordle.online', href: '/app/games/wordle-battle', online: true },
    ],
  },
  {
    icon: <FeatherIcon />,
    nameKey: 'games.rhyme.name',
    bodyKey: 'games.rhyme.body',
    modes: [
      { labelKey: 'games.mode.solo', blurbKey: 'games.rhyme.solo', href: '/app/games/rhyme' },
      { labelKey: 'games.mode.online', blurbKey: 'games.rhyme.online', href: '/app/games/rhyme-match', online: true },
    ],
  },
  {
    // a keyboard, not a quill: this one is about keys, and a second quill made
    // it look like another version of Rhyming Words
    icon: <KeyboardIcon />,
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
    icon: <TrophyIcon />,
    nameKey: 'games.quiz.name',
    bodyKey: 'games.quiz.body',
    modes: [
      { labelKey: 'games.mode.online', blurbKey: 'games.quiz.online', href: '/app/games/quiz', online: true },
    ],
  },
];

/**
 * Games overview. Every game is one box; clicking it asks how you want to play
 * (solo vs online) instead of scattering each mode across its own card. All
 * games are server-authoritative — the client never scores itself.
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

      <div className="grid grid-2">
        {GAMES.map((g) => {
          // a guest can play anything they play alone; only the modes against
          // other people need an account, so a game is only closed to them when
          // every way of playing it is
          const playable = g.modes.filter((m) => signedIn || !m.online);
          const single = playable.length === 1 ? playable[0] : undefined;
          return (
            <article className="feature game-card" key={g.nameKey}>
              <div className="feature-icon">{g.icon}</div>
              <div className="game-card-head">
                <h3>{t(g.nameKey)}</h3>
                <span className={`badge${playable.length > 0 ? ' badge-gold' : ''}`}>
                  {playable.length > 0 ? t('games.playable') : t('games.signInToPlay')}
                </span>
              </div>
              <p>{t(g.bodyKey)}</p>
              <ul className="game-modes-hint">
                {g.modes.map((m) => (
                  <li key={m.href}>
                    {t(m.labelKey)}
                    {!signedIn && m.online && <span className="mode-locked"> · {t('games.mode.needsAccount')}</span>}
                  </li>
                ))}
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
          <p>Create a free account to play, earn Zêr and climb the rankings across MyKurda.</p>
          <LinkButton to="/register" size="lg">
            Create your account
          </LinkButton>
        </div>
      )}
    </div>
  );
}
