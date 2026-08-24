import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useProfileModal } from '../profile/ProfileModal';
import { BookIcon, FeatherIcon, GameIcon, TrophyIcon, UserIcon, ArrowIcon } from '../components/icons';

const LINK_TILES = [
  { to: '/app/learn', icon: <BookIcon />, title: 'Learn', body: 'Continue your Kurdish course.' },
  { to: '/stories', icon: <FeatherIcon />, title: 'Stories', body: 'Read & listen to the library.' },
  { to: '/poems', icon: <FeatherIcon />, title: 'Poems', body: 'Explore Kurdish poetry.' },
  { to: '/games', icon: <GameIcon />, title: 'Games', body: 'Practice by playing.' },
  { to: '/app/rankings', icon: <TrophyIcon />, title: 'Rankings', body: 'See where you stand.' },
  { to: '/app/friends', icon: <UserIcon />, title: 'Friends', body: 'Find and add other learners.' },
];

function Tile({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <>
      <div className="feature-icon">{icon}</div>
      <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {title}
        <ArrowIcon />
      </h3>
      <p>{body}</p>
    </>
  );
}

export function Home(): React.JSX.Element {
  const { user } = useAuth();
  const { openProfile } = useProfileModal();
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
        {LINK_TILES.map((t) => (
          <Link className="feature card-link" to={t.to} key={t.to}>
            <Tile icon={t.icon} title={t.title} body={t.body} />
          </Link>
        ))}
        <button type="button" className="feature card-link" style={{ textAlign: 'left' }} onClick={() => openProfile({ kind: 'me' })}>
          <Tile icon={<UserIcon />} title="Profile" body="Your account & progress." />
        </button>
      </div>
    </div>
  );
}
