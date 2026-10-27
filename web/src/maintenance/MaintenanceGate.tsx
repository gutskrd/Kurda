import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { MAINTENANCE_POLL_SECONDS, maintenanceNoticeOf, type MaintenanceNotice, type StatusResponse } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { TimerIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { formatBackBy } from './notice';

/**
 * Pages that stay up while Hevalo is offline: the ones about Hevalo, which ask
 * the API for nothing, and signing in, which the API keeps open so that staff
 * can check the app before it opens again.
 */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/', '/about', '/privacy', '/terms', '/faq', '/how-hevalo-teaches', '/login']);

/** The app's own picture, when the notice has none: the deer from the icon. */
const OWN_PICTURE = '/mascot-deer.png';

/**
 * In place of the app while Hevalo is offline.
 *
 * Any request that finds it so (503 MAINTENANCE, lib/api.ts) puts this up,
 * with what an admin wrote to show meanwhile. What was open underneath goes;
 * when Hevalo is back it is drawn again from the start, so the page asks the
 * API for its data afresh, without the site being reloaded.
 */
export function MaintenanceGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { maintenance, setMaintenance } = useAuth();
  const { pathname } = useLocation();
  if (!maintenance || OPEN_PATHS.has(pathname)) return <>{children}</>;
  return <MaintenanceScreen notice={maintenance} onChange={setMaintenance} />;
}

/**
 * The offline screen: a picture, what is happening, when Hevalo expects to be
 * back, and a way to ask now. It asks `GET /status` by itself every
 * half minute while it can be seen, and hands on what it hears: a newer
 * notice, or null once Hevalo is open again.
 *
 * A title or message the admin left empty is the app's own, in the reader's
 * language; one written is shown as written.
 */
export function MaintenanceScreen({
  notice,
  onChange,
}: {
  notice: MaintenanceNotice;
  onChange: (notice: MaintenanceNotice | null) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const asking = useRef(false);
  // an uploaded picture that will not load gives way to the app's own
  const [failed, setFailed] = useState<string | null>(null);

  // the reader is taken to what has happened, once, as it appears
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    const res = await client.get<StatusResponse>('/status');
    asking.current = false;
    // no answer, or not one this can read: the screen stays and asks again
    if (!res.ok) return;
    if (res.data?.maintenance === null) onChange(null);
    else {
      const next = maintenanceNoticeOf(res.data);
      if (next) onChange(next);
    }
  }, [client, onChange]);

  // every half minute while the screen can be seen; a tab put away stops
  // asking, and asks at once when it is looked at again
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = (): void => {
      clearInterval(timer);
      timer = undefined;
    };
    const start = (): void => {
      stop();
      timer = setInterval(() => void ask(), MAINTENANCE_POLL_SECONDS * 1000);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') stop();
      else {
        void ask();
        start();
      }
    };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ask]);

  const picture = notice.pictureUrl !== failed ? notice.pictureUrl : null;
  const backBy = notice.backBy ? formatBackBy(notice.backBy, locale) : '';

  return (
    <main id="main" className="maintenance">
      <Brand />
      <div className={`maintenance-picture${picture ? '' : ' is-own'}`}>
        {picture ? (
          <img src={picture} alt="" onError={() => setFailed(picture)} />
        ) : (
          <img src={OWN_PICTURE} alt="" />
        )}
      </div>
      <div className="maintenance-words" aria-live="polite">
        <h1 ref={titleRef} tabIndex={-1} className="maintenance-title" dir={notice.title ? 'auto' : undefined}>
          {notice.title ?? t('maintenance.title')}
        </h1>
        <p className="maintenance-message" dir={notice.message ? 'auto' : undefined}>
          {notice.message ?? t('maintenance.message')}
        </p>
      </div>
      {backBy && (
        <p className="maintenance-back">
          <TimerIcon size={16} />
          {t('maintenance.backBy', { time: backBy })}
        </p>
      )}
      <Button variant="secondary" onClick={() => void ask()}>
        {t('common.retry')}
      </Button>
      <p className="maintenance-note">{t('maintenance.polling', { count: MAINTENANCE_POLL_SECONDS })}</p>
    </main>
  );
}
