import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { CompanionStatus } from '@kurda/shared';
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

/** The fields this form can mark: the three the server refuses over, and the month and year it will not send without. */
type Field = AuthField | 'birth';

/**
 * Create an account (/register).
 *
 * A refusal that is about one field is said under that field, which is marked,
 * shaken once and given the caret (auth/fieldProblem.ts): a username that is
 * taken under the username, a password rule under the password, the month and
 * year not chosen under those. What a username may be made of is under its
 * field from the start, as the password's rule is, so it is read before the
 * form is refused for it and not only after. An address that may already have
 * an account is not about a field and keeps its place above the form.
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
  /** the server's code for the refusal, where it calls for a way on rather than a fix to the form */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const problems = useFieldProblem<Field>({ email: 'email', username: 'username', password: 'password' });
  const [busy, setBusy] = useState(false);
  // read once: an earlier refusal in this browser session keeps the form away
  const [stopped, setStopped] = useState<AgeStopKind | null>(ageStopRemembered);
  const [inside, setInside] = useState(false);
  const held = useRef<(() => void) | null>(null);
  useEffect(() => () => held.current?.(), []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    problems.clear();
    const chosen = birthMonthOf(birth);
    if (!chosen) {
      problems.show('birth', t('age.required'));
      return;
    }
    setBusy(true);
    // made, the page stays a moment for Hevalo to be pleased, then leaves by itself
    const release = holdArrival();
    held.current = release;
    // the language they chose here is the account's from the first moment,
    // so the confirmation email and the next sign-in already speak it
    const err = await register({ email, username, password, locale, ...chosen });
    if (err) release?.();
    setBusy(false);
    if (err?.code === 'UNDER_MINIMUM_AGE') {
      // no account was made; the explanation replaces the form, and stays
      rememberAgeStop('refused');
      setStopped('refused');
    } else if (err?.field) {
      problems.show(err.field, err.message);
    } else if (err) {
      setError(err.message);
      setErrorCode(err.code ?? null);
    } else {
      // a friend's invite or a story's quiz that sent them here: opened once
      // the email is confirmed (pages/VerifyEmail), not lost to the first lesson
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
  const usernameRule = t('error.code.usernameChars');
  // the rule the name broke is the hint already under the field: said once, in red, rather than twice
  const ruleIsTheProblem = usernameProblem === usernameRule;
  const usernameSaidBy = [ruleIsTheProblem ? '' : 'username-hint', usernameProblem ? 'username-error' : ''].filter(Boolean).join(' ');

  return (
    <div className="auth-wrap">
      <AuthCard status={companion} word="welcome">
        <div className="auth-head">
          <h1>{t('auth.register.title')}</h1>
          <p>{t('auth.register.freeToStart')}</p>
        </div>

        <form onSubmit={submit} noValidate>
          {/*
            An address that may already have an account is not a mistake in the
            form, so it is said calmly and with the two ways on: signing in, or
            a new password. The server keeps it vague on purpose — nobody may
            learn from here which addresses are registered — and so does this.
          */}
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
              aria-describedby={emailProblem ? 'email-error' : undefined}
            />
            {emailProblem && (
              <span className="field-problem" id="email-error" role="alert">
                {emailProblem}
              </span>
            )}
          </div>

          <div className={problems.fieldClass('username')}>
            <label className="field-label" htmlFor="username">
              {t('auth.username')}
            </label>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                problems.clear('username');
              }}
              autoComplete="username"
              // a name is typed as it is meant: no capital put on it, nothing corrected, no red wave under a Kurdish word
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('auth.register.usernameHelp')}
              required
              aria-invalid={usernameProblem ? true : undefined}
              aria-describedby={usernameSaidBy}
            />
            {!ruleIsTheProblem && (
              <span className="field-hint" id="username-hint">
                {usernameRule}
              </span>
            )}
            {usernameProblem && (
              <span className="field-problem" id="username-error" role="alert">
                {usernameProblem}
              </span>
            )}
          </div>

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
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" state={location.state}>
            {t('auth.register.signIn')}
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
