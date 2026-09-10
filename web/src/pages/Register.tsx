import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useI18n, useT } from '../i18n/I18nProvider';
import { LanguagePicker } from '../i18n/LanguagePicker';

export function Register(): React.JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { locale, setLocale } = useI18n();
  const t = useT();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // the language they chose here is the account's from the first moment,
    // so the confirmation email and the next sign-in already speak it
    const err = await register({ email, username, password, locale });
    setBusy(false);
    if (err) setError(err);
    else navigate('/app', { replace: true });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>{t('auth.register.title')}</h1>
          <p>{t('auth.register.freeToStart')}</p>
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
              placeholder={t('auth.register.usernameHelp')}
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

          {/*
            Asked here rather than after signing up, and it takes effect while
            you are still on this page — so the first thing a new account sees
            is already in the language it chose, including its welcome email.
          */}
          <div className="field">
            <LanguagePicker value={locale} onChange={setLocale} help={t('language.chooseHelp')} disabled={busy} />
          </div>

          <Button type="submit" block disabled={busy}>
            {busy ? t('auth.register.submitting') : t('auth.register.submit')}
          </Button>

          <p className="oauth-note">
            By creating an account you agree to the MyKurda Terms and Privacy Policy.
          </p>
        </form>

        <p className="auth-alt">
          Already have an account? <Link to="/login">{t('auth.register.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
