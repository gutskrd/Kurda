import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useI18n, useT } from '../i18n/I18nProvider';
import { LanguagePicker } from '../i18n/LanguagePicker';
import { BirthMonthFields, EMPTY_BIRTH_MONTH, birthMonthOf } from '../auth/BirthMonthFields';
import { AgeStop, ageStopRemembered, rememberAgeStop, type AgeStopKind } from '../auth/AgeStop';

export function Register(): React.JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { locale, setLocale } = useI18n();
  const t = useT();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState(EMPTY_BIRTH_MONTH);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // read once: an earlier refusal in this browser session keeps the form away
  const [stopped, setStopped] = useState<AgeStopKind | null>(ageStopRemembered);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const chosen = birthMonthOf(birth);
    if (!chosen) {
      setError(t('age.required'));
      return;
    }
    setBusy(true);
    setError(null);
    // the language they chose here is the account's from the first moment,
    // so the confirmation email and the next sign-in already speak it
    const err = await register({ email, username, password, locale, ...chosen });
    setBusy(false);
    if (err?.code === 'UNDER_MINIMUM_AGE') {
      // no account was made; the explanation replaces the form, and stays
      rememberAgeStop('refused');
      setStopped('refused');
    } else if (err) setError(err.message);
    else navigate('/app', { replace: true });
  }

  if (stopped) return <AgeStop accountClosed={stopped === 'closed'} />;

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

          <div className="field">
            <label className="field-label" htmlFor="username">
              {t('auth.username')}
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
              {t('auth.password')}
            </label>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <span className="field-hint">{t('auth.passwordHint')}</span>
          </div>

          <BirthMonthFields value={birth} onChange={setBirth} disabled={busy} />

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

          {/* the sentence names two documents, so it links to both of them */}
          <p className="oauth-note">
            {t('auth.register.terms')}{' '}
            <Link to="/terms" className="doc-link">{t('footer.terms')}</Link>
            {' · '}
            <Link to="/privacy" className="doc-link">{t('footer.privacy')}</Link>
          </p>
        </form>

        <p className="auth-alt">
          {t('auth.register.haveAccount')} <Link to="/login">{t('auth.register.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
