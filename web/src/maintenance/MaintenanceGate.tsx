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
 * Pages that stay up while Hevalo is offline: the public pages, which need no API, and sign-in, which the API keeps
 * open so staff can check the app before it reopens.
 */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/', '/about', '/privacy', '/terms', '/faq', '/how-hevalo-teaches', '/login']);

/** The app's own picture, when the notice has none: the deer from the icon. */
const OWN_PICTURE = '/mascot-deer.png';

/**
 * Replaces the app while Hevalo is offline, as reported by any 503 MAINTENANCE answer (lib/api.ts). When Hevalo is
 * back the app mounts again from scratch, so pages refetch their data without a reload.
 */
export function MaintenanceGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { maintenance, setMaintenance } = useAuth();
  const { pathname } = useLocation();
  if (!maintenance || OPEN_PATHS.has(pathname)) return <>{children}</>;
  return <MaintenanceScreen notice={maintenance} onChange={setMaintenance} />;
}

/**
 * The offline screen: a picture, the admin's notice, when Hevalo expects to be back and a way to check now. It polls
 * `GET /status` while visible and reports a newer notice, or null once Hevalo is open. An empty title or message
 * falls back to the app's own words.
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
  // An uploaded picture that fails to load gives way to the app's own.
  const [failed, setFailed] = useState<string | null>(null);

  // Focus the heading once, as the screen appears.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    const res = await client.get<StatusResponse>('/status');
    asking.current = false;
    // No usable answer: the screen stays and asks again.
    if (!res.ok) return;
    if (res.data?.maintenance === null) onChange(null);
    else {
      const next = maintenanceNoticeOf(res.data);
      if (next) onChange(next);
    }
  }, [client, onChange]);

  // Poll while the tab is visible, and ask at once when it becomes visible again.
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
