import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { PersonGlyph } from '../components/icons';

/**
 * The profile view — a liquid-glass "contact card". Shows the person's details
 * inside a frosted plate, with the MyKurda logo in the lower-right. Built to be
 * reusable for another user's public profile once that endpoint is wired in;
 * for now it renders the signed-in user from /me.
 */
export function Profile(): React.JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return <div className="container" />;

  const name = user.displayName || user.username;

  return (
    <div className="profile-wrap">
      <article className="pcard">
        <PersonGlyph className="pcard-figure" size={128} />

        <div className="pcard-plate">
          <div className="pcard-name">{name}</div>
          <div className="pcard-handle">@{user.username}</div>

          <dl className="pcard-rows">
            <div className="pcard-row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="pcard-row">
              <dt>Email verified</dt>
              <dd style={{ color: user.emailVerified ? 'var(--success)' : 'var(--ink-3)' }}>
                {user.emailVerified ? 'Verified' : 'Not yet'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="pcard-foot">
          <span className="pcard-label">Profile</span>
          <span className="pcard-logo">
            <img src="/logo.png" alt="" aria-hidden="true" />
            MyKurda
          </span>
        </div>
      </article>

      <div className="profile-actions">
        <Button
          variant="secondary"
          onClick={() => {
            void logout().then(() => navigate('/'));
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
