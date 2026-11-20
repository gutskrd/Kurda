import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { checkUsername, type CompanionStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { AuthCard } from '../auth/AuthCard';
import { arrivalPause, holdArrival } from '../auth/arrival';
import { useFieldProblem, type AuthField } from '../auth/fieldProblem';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useI18n, useT } from '../i18n/I18nProvider';
import { LanguagePicker } from '../i18n/LanguagePicker';
import { BirthMonthFields, EMPTY_BIRTH_MONTH, birthMonthOf } from '../auth/BirthMonthFields';
import { AgeStop, ageStopRemembered, rememberAgeStop, type AgeStopKind } from '../auth/AgeStop';
import { rememberAfterSignup } from '../auth/afterSignup';
import { UsernameField } from '../auth/UsernameField';
import { usernameRefusalText } from '../lib/usernameText';

/** The fields this form can mark: the three the server refuses over, and the birth month and year. */
type Field = AuthField | 'birth';

/**
 * Create an account (/register). A refusal about one field is said under it, which is marked, shaken and focused
 * (auth/fieldProblem.ts). The username and password rules show under their fields from the start; the username field
 * lowercases as you type and names disallowed characters before anything is sent (auth/UsernameField.tsx). An address
 * that may already have an account is not a field problem and shows above the form.
 */
export function Register(): React.JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, setLocale } = useI18n();
  const t = useT();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState(EMPTY_BIRTH_MONTH);
  const [error, setError] = useState<string | null>(null);
  /** The server's code for the refusal, where it calls for a way on rather than a fix to the form. */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const problems = useFieldProblem<Field>({ email: 'email', username: 'username', password: 'password' });
  const [busy, setBusy] = useState(false);
  // Read once: an earlier refusal this browser session keeps the form away.
  const [stopped, setStopped] = useState<AgeStopKind | null>(ageStopRemembered);
  const [inside, setInside] = useState(false);
  const held = useRef<(() => void) | null>(null);
  useEffect(() => () => held.current?.(), []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    problems.clear();
    // The rule the server would refuse by, said under the field up front (shared/src/username.ts).
    const name = checkUsername(username);
    if (!name.ok) {
      problems.show('username', usernameRefusalText(name.reason, name.reason === 'invalid-chars' ? name.chars : undefined, t));
      return;
    }
    const chosen = birthMonthOf(birth);
    if (!chosen) {
      problems.show('birth', t('age.required'));
      return;
    }
    setBusy(true);
    // Once made, the page stays a moment for Hevalo, then leaves by itself.
    const release = holdArrival();
    held.current = release;
    // The chosen language is the account's from the start, so the confirmation email uses it.
    const err = await register({ email, username: name.value, password, locale, ...chosen });
    if (err) release?.();
    setBusy(false);
    if (err?.code === 'UNDER_MINIMUM_AGE') {
      // No account was made; the explanation replaces the form and stays.
      rememberAgeStop('refused');
      setStopped('refused');
    } else if (err?.field) {
      problems.show(err.field, err.message);
    } else if (err) {
      setError(err.message);
      setErrorCode(err.code ?? null);
    } else {
      // A friend's invite or a story quiz that sent them here opens once the email is confirmed (pages/VerifyEmail).
      rememberAfterSignup((location.state as { from?: unknown } | null)?.from);
      setInside(true);
      if (release) await arrivalPause();
      release?.();
      navigate('/app', { replace: true });
    }
  }

  if (stopped) return <AgeStop accountClosed={stopped === 'closed'} />;

  const companion: CompanionStatus = inside ? 'success' : busy ? 'busy' : error || problems.any ? 'error' : 'idle';
  const emailProblem = problems.of('email');
  const usernameProblem = problems.of('username');
  const passwordProblem = problems.of('password');

  return (
    <div className="auth-wrap">
      <AuthCard status={companion} word="welcome">
        <div className="auth-head">
          <h1>{t('auth.register.title')}</h1>
          <p>{t('auth.register.freeToStart')}</p>
        </div>

        <form onSubmit={submit} noValidate>
          {/* Said calmly with both ways on (sign in, new password), and as vague as the server about whether the address is registered. */}
          {error && errorCode === 'REGISTRATION_FAILED' ? (
            <div className="msg" role="alert">
              {error}
              <span className="msg-actions">
                <Link to="/login" state={location.state} className="btn btn-secondary btn-sm">
                  {t('nav.login')}
                </Link>
                <Link to="/forgot-password" className="btn btn-ghost btn-sm">
                  {t('auth.reset.title')}
                </Link>
              </span>
            </div>
          ) : (
            error && (
              <div className="msg msg-error" role="alert">
                {error}
              </div>
            )
          )}

          <div className={problems.fieldClass('email')}>
            <label className="field-label" htmlFor="email">
              {t('auth.email')}
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                problems.clear('email');
              }}
              autoComplete="email"
              placeholder="you@example.com"
              required
              autoFocus
              aria-invalid={emailProblem ? true : undefined}
              aria-describedby={emailProblem ? 'email-hint email-error' : 'email-hint'}
            />
            <span className="field-hint" id="email-hint">
              {t('auth.register.emailHint')}
            </span>
            {emailProblem && (
              <span className="field-problem" id="email-error" role="alert">
                {emailProblem}
              </span>
            )}
          </div>

          <UsernameField
            id="username"
            label={t('auth.username')}
            value={username}
            onChange={(next) => {
              setUsername(next);
              problems.clear('username');
            }}
            problem={usernameProblem}
            urgent
            placeholder={t('auth.register.usernameHelp')}
            about={t('auth.register.usernameSeen')}
            className={problems.fieldClass('username')}
          />

          <div className={problems.fieldClass('password')}>
            <label className="field-label" htmlFor="password">
              {t('auth.password')}
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(next) => {
                setPassword(next);
                problems.clear('password');
              }}
              autoComplete="new-password"
              invalid={Boolean(passwordProblem)}
              describedBy={passwordProblem ? 'password-hint password-error' : 'password-hint'}
            />
            <span className="field-hint" id="password-hint">
              {t('auth.passwordHint')}
            </span>
            {passwordProblem && (
              <span className="field-problem" id="password-error" role="alert">
                {passwordProblem}
              </span>
            )}
          </div>

          <BirthMonthFields
            value={birth}
            onChange={(next) => {
              setBirth(next);
              problems.clear('birth');
            }}
            disabled={busy}
            problem={problems.of('birth')}
            className={problems.fieldClass('birth', 'field birth-month')}
          />

          {/* Asked here so the new account, and its welcome email, are in the chosen language from the start. */}
          <div className="field">
            <LanguagePicker value={locale} onChange={setLocale} help={t('language.chooseHelp')} disabled={busy} />
          </div>

          <Button type="submit" block disabled={busy}>
            {busy ? t('auth.register.submitting') : t('auth.register.submit')}
          </Button>

          {/* The sentence names two documents, so it links to both. */}
          <p className="oauth-note">
            {t('auth.register.terms')}{' '}
            <Link to="/terms" className="doc-link">{t('footer.terms')}</Link>
            {' · '}
            <Link to="/privacy" className="doc-link">{t('footer.privacy')}</Link>
          </p>
        </form>

        <p className="auth-alt">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" state={location.state}>
            {t('auth.register.signIn')}
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
