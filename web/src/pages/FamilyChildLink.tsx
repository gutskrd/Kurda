import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthCard } from '../auth/AuthCard';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import type { Translate } from '../i18n/I18nProvider';

type Done = 'removed' | 'kept' | 'gone';

/** What the link is about, as the server reads it from the token: what it does, and the child by name. */
interface Preview {
  action: 'remove' | 'keep';
  child: { name: string } | null;
}

/** A refusal in the reader's words; a link that is old, changed or not ours says to go to the app. */
function refusal(error: ApiError, t: Translate): string {
  return error.code === 'FAMILY_LINK_INVALID' ? t('family.link.invalid') : describeError(error, t);
}

/**
 * Where the links in a parent's emails about a child's profile land (api family/notices.ts): delete the profile, or
 * keep one that was going for being unused. Opening the page only reads what the link is about, since mail programs
 * and link scanners open links on their own; it names the child, and nothing happens until the parent presses the one
 * button. Child profiles themselves live in the phone app.
 */
export function FamilyChildLink(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the link's own word until the server has read the token, which decides
  const remove = (preview?.action ?? (params.get('action') === 'keep' ? 'keep' : 'remove')) === 'remove';

  useEffect(() => {
    if (!token) return;
    let live = true;
    void client.post<Preview>('/family/child-link/preview', { token }).then((res) => {
      if (!live) return;
      if (!res.ok) return setError(refusal(res.error, t));
      if (!res.data.child) setDone('gone');
      else setPreview(res.data);
    });
    return () => {
      live = false;
    };
  }, [client, token, t]);

  async function act(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<{ done: Done }>('/family/child-link', { token, confirm: true });
    setBusy(false);
    if (res.ok) setDone(res.data.done);
    else setError(refusal(res.error, t));
  }

  if (!token || (error && !preview)) {
    return (
      <div className="auth-wrap">
        <AuthCard status="error">
          <div className="auth-head">
            <h1>{t(remove ? 'family.link.removeTitle' : 'family.link.keepTitle')}</h1>
            <p>{error ?? t('family.link.invalid')}</p>
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

  if (!preview) {
    return (
      <div className="auth-wrap">
        <AuthCard status="busy">
          <div className="auth-head">
            <h1>{t(remove ? 'family.link.removeTitle' : 'family.link.keepTitle')}</h1>
          </div>
        </AuthCard>
      </div>
    );
  }

  const name = preview.child!.name;
  return (
    <div className="auth-wrap">
      <AuthCard status={busy ? 'busy' : error ? 'error' : 'idle'}>
        <div className="auth-head">
          <h1>{t(remove ? 'family.link.removeNamed' : 'family.link.keepNamed', { name })}</h1>
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
