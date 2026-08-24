import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';

export function Register(): React.JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await register({ email, username, password });
    setBusy(false);
    if (err) setError(err);
    else navigate('/app', { replace: true });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Create your account</h1>
          <p>Free to start. It takes under a minute.</p>
        </div>

        <form onSubmit={submit} noValidate>
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="How others will see you"
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <span className="field-hint">At least 8 characters, with a mix of letters and numbers.</span>
          </div>

          <Button type="submit" block disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>

          <p className="oauth-note">
            By creating an account you agree to the MyKurda Terms and Privacy Policy.
          </p>
        </form>

        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
