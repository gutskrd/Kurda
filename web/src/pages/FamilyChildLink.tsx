import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthCard } from '../auth/AuthCard';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

type Done = 'removed' | 'kept' | 'gone';

/**
 * Where the links in a parent's emails about a child's profile land (api family/notices.ts): delete the profile, or
 * keep one that was going for being unused. Nothing happens on opening the page, since mail programs open links on
 * their own; the parent presses the one button. Child profiles themselves live in the phone app.
 */
export function FamilyChildLink(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const remove = params.get('action') !== 'keep';
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<{ done: Done }>('/family/child-link', { token });
    setBusy(false);
    if (res.ok) setDone(res.data.done);
    else setError(res.error.code === 'FAMILY_LINK_INVALID' ? t('family.link.invalid') : describeError(res.error, t));
  }

  if (!token) {
    return (
      <div className="auth-wrap">
        <AuthCard status="error">
          <div className="auth-head">
            <h1>{t(remove ? 'family.link.removeTitle' : 'family.link.keepTitle')}</h1>
            <p>{t('family.link.invalid')}</p>
          </div>
        </AuthCard>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <AuthCard status="success">
          <div className="auth-head">
            <h1>{t(done === 'removed' ? 'family.link.removed' : done === 'kept' ? 'family.link.kept' : 'family.link.gone')}</h1>
          </div>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <AuthCard status={busy ? 'busy' : error ? 'error' : 'idle'}>
        <div className="auth-head">
          <h1>{t(remove ? 'family.link.removeTitle' : 'family.link.keepTitle')}</h1>
          <p>{t(remove ? 'family.link.removeBody' : 'family.link.keepBody')}</p>
        </div>
        {error && <div className="msg msg-error">{error}</div>}
        <Button block disabled={busy} onClick={() => void act()}>
          {t(remove ? 'family.link.removeAction' : 'family.link.keepAction')}
        </Button>
      </AuthCard>
    </div>
  );
}
