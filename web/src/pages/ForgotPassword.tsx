import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

export function ForgotPassword(): React.JSX.Element {
  const t = useT();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    // The endpoint intentionally doesn't reveal whether an account exists, so we
    // always show the same confirmation — no account enumeration from the client.
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>{t('auth.reset.title')}</h1>
          <p>{t('auth.reset.forgotHelp')}</p>
        </div>

        {sent ? (
          <>
            <div className="msg msg-success" role="status">
              {t('auth.forgot.sent', { email })}
            </div>
            <Link to="/login" className="btn btn-secondary btn-block">
              {t('auth.forgot.backToSignIn')}
            </Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="email">
                {t('auth.email')}
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
            <Button type="submit" block disabled={busy}>
              {busy ? t('auth.sending') : t('auth.reset.sendLink')}
            </Button>
            <p className="auth-alt" style={{ border: 0, paddingTop: 16 }}>
              {t('auth.forgot.remembered')} <Link to="/login">{t('auth.signIn')}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
