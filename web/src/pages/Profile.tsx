import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';

export function Profile(): React.JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return <div className="container" />;

  const initial = (user.displayName || user.username || '?').charAt(0).toUpperCase();

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">Profîl · Your account</span>
        <h1 className="page-title">Profile</h1>
      </div>

      <div className="profile-head">
        <div className="avatar" aria-hidden="true">
          {initial}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600 }}>
            {user.displayName || user.username}
          </div>
          <div className="muted">@{user.username}</div>
        </div>
      </div>

      <dl className="def-list">
        <div className="def-row">
          <dt>Username</dt>
          <dd>@{user.username}</dd>
        </div>
        <div className="def-row">
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div className="def-row">
          <dt>Email verified</dt>
          <dd>
            {user.emailVerified ? (
              <span className="badge" style={{ color: 'var(--success)' }}>
                Verified
              </span>
            ) : (
              <span className="badge">Not yet</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="muted" style={{ margin: '18px 0 26px', fontSize: '0.9rem' }}>
        Editing your profile, changing your password and managing sessions are available in the
        MyKurda app. More account controls are coming to the web soon.
      </p>

      <Button
        variant="secondary"
        onClick={() => {
          void logout().then(() => navigate('/'));
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
