import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BookIcon, FeatherIcon, GameIcon, TrophyIcon, UserIcon, ArrowIcon } from '../components/icons';

const TILES = [
  { to: '/app/learn', icon: <BookIcon />, title: 'Learn', body: 'Continue your Kurdish course.' },
  { to: '/stories', icon: <FeatherIcon />, title: 'Stories', body: 'Read & listen to the library.' },
  { to: '/poems', icon: <FeatherIcon />, title: 'Poems', body: 'Explore Kurdish poetry.' },
  { to: '/games', icon: <GameIcon />, title: 'Games', body: 'Practice by playing.' },
  { to: '/app/rankings', icon: <TrophyIcon />, title: 'Rankings', body: 'See where you stand.' },
  { to: '/app/profile', icon: <UserIcon />, title: 'Profile', body: 'Your account & progress.' },
];

export function Home(): React.JSX.Element {
  const { user } = useAuth();
  const name = user?.displayName || user?.username || 'there';

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">Kefxweş î · Welcome back</span>
        <h1 className="hello">Hello, {name}.</h1>
        <p className="page-sub">Pick up where you left off, or explore something new.</p>
      </div>

      {user && !user.emailVerified && (
        <div className="msg" role="status" style={{ marginBottom: 24 }}>
          Please verify your email to unlock everything. We sent a code to <strong>{user.email}</strong> —
          open the MyKurda app to confirm it.
        </div>
      )}

      <div className="grid grid-3">
        {TILES.map((t) => (
          <Link className="feature card-link" to={t.to} key={t.to}>
            <div className="feature-icon">{t.icon}</div>
            <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {t.title}
              <ArrowIcon />
            </h3>
            <p>{t.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
