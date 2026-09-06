import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { FeatherIcon, BookIcon, KeyboardIcon, TrophyIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';

interface GameMode {
  label: string;
  blurb: string;
  href: string;
  /** played against other people, so it needs an account */
  online?: boolean;
}

interface GameCard {
  icon: React.JSX.Element;
  name: string;
  body: string;
  /** how this game can be played; one box per game, the mode is chosen on click */
  modes: GameMode[];
}

/** One box per game — the mode (solo / online / …) is chosen after clicking. */
const GAMES: GameCard[] = [
  {
    icon: <BookIcon />,
    name: 'Kurdish Wordle',
    body: 'Guess the Kurdish word in six tries — on your own, or racing a friend.',
    modes: [
      { label: 'Play solo', blurb: 'Today’s daily puzzle, plus unlimited practice rounds across three difficulties.', href: '/app/games/wordle' },
      { label: 'Play online', blurb: 'Create a battle, share the invite link, and race a friend to the same word.', href: '/app/games/wordle-battle', online: true },
    ],
  },
  {
    icon: <FeatherIcon />,
    name: 'Rhyming Words',
    body: 'Find as many Kurdish words as you can that rhyme with the prompt.',
    modes: [
      { label: 'Play solo', blurb: 'A timed solo round against the clock — good for building vocabulary fast.', href: '/app/games/rhyme' },
      { label: 'Play online', blurb: 'Head-to-head: share an invite link and out-rhyme a friend in one shared window.', href: '/app/games/rhyme-match', online: true },
    ],
  },
  {
    // a keyboard, not a quill: this one is about keys, and a second quill made
    // it look like another version of Rhyming Words
    icon: <KeyboardIcon />,
    name: 'Typing Race',
    body: 'Type a Kurdish text as fast and as accurately as you can — speed is measured server-side.',
    modes: [
      {
        label: 'Race the clock',
        blurb: 'Pick a length, type the text, and get your words per minute and accuracy.',
        href: '/app/games/race',
      },
    ],
  },
  {
    icon: <TrophyIcon />,
    name: 'Ranked Quiz',
    body: 'Fast 1-v-1 matches: answer Kurdish questions quicker and more accurately than your opponent.',
    modes: [
      { label: 'Play online', blurb: 'Get matched with an opponent. Server-scored and rated — your rating moves.', href: '/app/games/quiz', online: true },
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

  return (
    <div className="container" style={{ paddingTop: 48, paddingBottom: 72 }}>
      <div className="page-header">
        <span className="eyebrow">Yarî · Learn by playing</span>
        <h1 className="page-title">Games</h1>
        <p className="page-sub">
          Practice that doesn’t feel like practice. Every game is scored on the server, so the
          leaderboards stay fair.
        </p>
      </div>

      <div className="grid grid-2">
        {GAMES.map((g) => {
          // a guest can play anything they play alone; only the modes against
          // other people need an account, so a game is only closed to them when
          // every way of playing it is
          const playable = g.modes.filter((m) => signedIn || !m.online);
          const single = playable.length === 1 ? playable[0] : undefined;
          return (
            <article className="feature game-card" key={g.name}>
              <div className="feature-icon">{g.icon}</div>
              <div className="game-card-head">
                <h3>{g.name}</h3>
                <span className={`badge${playable.length > 0 ? ' badge-gold' : ''}`}>
                  {playable.length > 0 ? 'Playable' : 'Sign in to play'}
                </span>
              </div>
              <p>{g.body}</p>
              <ul className="game-modes-hint">
                {g.modes.map((m) => (
                  <li key={m.href}>
                    {m.label}
                    {!signedIn && m.online && <span className="mode-locked"> · needs an account</span>}
                  </li>
                ))}
              </ul>
              {playable.length > 0 &&
                (single ? (
                  <Link to={single.href} className="btn btn-primary btn-sm">
                    Play
                  </Link>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setChooser(g)}>
                    Play
                  </button>
                ))}
            </article>
          );
        })}
      </div>

      <Modal open={chooser !== null} onClose={() => setChooser(null)} label={chooser ? `How do you want to play ${chooser.name}?` : 'Choose a mode'}>
        {chooser && (
          <div className="mode-chooser">
            <h2 className="friend-heading" style={{ marginTop: 0 }}>{chooser.name}</h2>
            <p className="muted">How do you want to play?</p>
            <div className="mode-list">
              {chooser.modes.map((m) => (
                <Link key={m.href} to={m.href} className="mode-option" onClick={() => setChooser(null)}>
                  <span className="mode-option-label">{m.label}</span>
                  <span className="mode-option-blurb">{m.blurb}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {!signedIn && (
        <div className="cta" style={{ marginTop: 40 }}>
          <h2 className="h-section">Play, and keep score</h2>
          <p>Create a free account to play, earn Zêr and climb the rankings across MyKurda.</p>
          <LinkButton to="/register" size="lg">
            Create your account
          </LinkButton>
        </div>
      )}
    </div>
  );
}
