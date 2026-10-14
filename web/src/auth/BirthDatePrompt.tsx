import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import { BirthMonthFields, EMPTY_BIRTH_MONTH, birthMonthOf } from './BirthMonthFields';
import { rememberAgeStop } from './AgeStop';

/**
 * The one question an account without a birth month is asked before anything
 * else: everyone who signed up before it was asked.
 *
 * Blocking, because the answer decides what the rest of the app may do — who
 * can find you, who can message you, whether you are in a league — and every
 * one of those would otherwise run on a guess. Small, because it is one
 * question. It can be answered once, which the card says before it is saved.
 *
 * Under 13 the server closes the account; the session goes with it, and the
 * explanation takes over from the sign-up page so it is still there after a
 * reload. Signing out is offered too, so the question is never a dead end.
 */
export function BirthDatePrompt(): React.JSX.Element {
  const t = useT();
  const { client, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [birth, setBirth] = useState(EMPTY_BIRTH_MONTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const chosen = birthMonthOf(birth);
    if (!chosen) {
      setError(t('age.required'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await client.post('/me/birth-date', chosen);
    if (res.ok) {
      await refreshUser();
      return;
    }
    setBusy(false);
    if (res.error.code === 'UNDER_MINIMUM_AGE') {
      rememberAgeStop('closed');
      await logout();
      navigate('/register', { replace: true });
      return;
    }
    // answered from another tab or device in the meantime: nothing left to ask
    if (res.error.code === 'BIRTH_DATE_ALREADY_SET') {
      await refreshUser();
      return;
    }
    setError(describeError(res.error, t));
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>{t('age.prompt.title')}</h1>
          <p>{t('age.prompt.body')}</p>
        </div>
        <form onSubmit={save} noValidate>
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}
          <BirthMonthFields value={birth} onChange={setBirth} disabled={busy} />
          <p className="field-hint" style={{ marginBottom: 16 }}>
            {t('age.prompt.once')}
          </p>
          <Button type="submit" block disabled={busy}>
            {busy ? t('age.prompt.saving') : t('age.prompt.save')}
          </Button>
        </form>

        {/* blocking, but not a trap: someone who would rather not answer now
            (or is on somebody else's account) can leave */}
        <div className="auth-alt">
          <button type="button" className="link-btn" disabled={busy} onClick={() => void logout()}>
            {t('settings.sessions.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
