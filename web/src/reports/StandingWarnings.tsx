import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AccountStanding, StandingSanction } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import { CATEGORY_LABEL } from './labels';
import { formatDay, STANDING_PATH } from './restriction';

/**
 * A new warning shown once as a dialog with its reasons; closing it by any route marks it seen
 * (`POST /me/standing/ack`), and Account standing keeps it. The standing is read once per sign-in.
 */
export function StandingWarnings(): React.JSX.Element | null {
  const { client, status, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [warnings, setWarnings] = useState<StandingSanction[]>([]);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'signedIn' || !user || checkedFor.current === user.id) return;
    checkedFor.current = user.id;
    let alive = true;
    void client.get<AccountStanding>('/me/standing').then((res) => {
      if (alive && res.ok) setWarnings(res.data.unacknowledgedWarnings ?? []);
    });
    return () => {
      alive = false;
    };
  }, [client, status, user]);

  if (warnings.length === 0) return null;

  function close(): void {
    const ids = warnings.map((w) => w.id);
    setWarnings([]);
    void client.post('/me/standing/ack', { ids }).catch(() => undefined);
  }

  return (
    <Modal open onClose={close} label={t('warning.title')}>
      <div className="standing-warning">
        <h2 className="report-heading">{t('warning.title')}</h2>
        <p className="report-intro">{t('warning.intro')}</p>
        {warnings.map((w) => (
          <div key={w.id} className="standing-warning-item">
            <p className="sanction-rule">
              {t('standing.rule', { rule: t(CATEGORY_LABEL[w.policy]) })} · {formatDay(w.startsAt, locale)}
            </p>
            <blockquote className="sanction-statement-text" dir="auto">
              {w.statement}
            </blockquote>
          </div>
        ))}
        <div className="report-actions">
          <Link to={STANDING_PATH} className="btn btn-ghost" onClick={close}>
            {t('restriction.seeStanding')}
          </Link>
          <Button onClick={close}>{t('warning.ok')}</Button>
        </div>
      </div>
    </Modal>
  );
}
