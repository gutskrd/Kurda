import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { GameIcon, FeatherIcon, BookIcon, TrophyIcon } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';

interface GameCard {
  icon: React.JSX.Element;
  name: string;
  body: string;
  status: string;
  /** when present + signed in, the game is playable here */
  playHref?: string;
}

const GAMES: GameCard[] = [
  {
    icon: <BookIcon />,
    name: 'Kurdish Wordle',
    body: 'Guess the Kurdish word in six tries. A daily puzzle plus endless practice rounds across difficulties.',
    status: 'On mobile',
    playHref: '/app/games/wordle',
  },
  {
    icon: <FeatherIcon />,
    name: 'Rhyme battles',
    body: 'Head-to-head rhyming duels — think fast, match sounds, and climb the ladder against other learners.',
    status: 'On mobile',
  },
  {
    icon: <GameIcon />,
    name: 'Quizzes',
    body: 'Quick, focused quizzes that check what you’ve learned and turn review into a few fun minutes.',
    status: 'On mobile',
  },
  {
    icon: <TrophyIcon />,
    name: 'Ranked matches',
    body: 'Compete in rated 1-v-1 matches where the server keeps score — fair, timed and tamper-proof.',
    status: 'On mobile',
  },
];

/**
 * Games overview. The games are interactive and server-authoritative (the API
 * computes results — the client never scores itself), and the play experience
 * ships in the mobile app today. We present them honestly rather than faking a
 * playable board here; signed-in members get a clear next step.
 */
export function Games(): React.JSX.Element {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  return (
    <div className="container" style={{ paddingTop: 48, paddingBottom: 72 }}>
      <div className="page-header">
        <span className="eyebrow">Yarî · Learn by playing</span>
        <h1 className="page-title">Games</h1>
        <p className="page-sub">
          Practice that doesn’t feel like practice. Every game is scored on the server, so the
          leaderboards stay fair. The full playable experience lives in the MyKurda app today, with
          the web versions on the way.
        </p>
      </div>

      <div className="grid grid-2">
        {GAMES.map((g) => {
          const playable = signedIn && g.playHref;
          return (
            <article className="feature" key={g.name}>
              <div className="feature-icon">{g.icon}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>{g.name}</h3>
                <span className={`badge${playable ? ' badge-gold' : ''}`}>{playable ? 'Playable' : g.status}</span>
              </div>
              <p>{g.body}</p>
              {playable && (
                <Link to={g.playHref!} className="btn btn-primary btn-sm">
                  Play
                </Link>
              )}
            </article>
          );
        })}
      </div>

      <div className="cta" style={{ marginTop: 40 }}>
        <h2 className="h-section">{signedIn ? 'Keep your streak going' : 'Play, and keep score'}</h2>
        <p>
          {signedIn
            ? 'Jump back into your lessons and rankings while the web games arrive.'
            : 'Create a free account to play, earn Zêr and climb the rankings across MyKurda.'}
        </p>
        {signedIn ? (
          <LinkButton to="/app" size="lg">
            Go to your home
          </LinkButton>
        ) : (
          <LinkButton to="/register" size="lg">
            Create your account
          </LinkButton>
        )}
      </div>
    </div>
  );
}
