import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import { useOptimistic } from '../lib/optimistic';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import {
  CATEGORY_LABEL,
  NOTIFICATION_CATEGORIES,
  formatMinute,
  parseMinute,
  quietEnabled,
  prefsChange,
  quietPatch,
  type NotificationCategory,
  type NotificationPrefs,
} from './prefs';

/**
 * Which notification categories the reader gets, and quiet hours (`GET`/`PUT /me/notification-prefs`). Each control
 * moves at once and saves on change (lib/optimistic.ts), sending only what differs from what the server has; a failure
 * puts the controls back and says why.
 */
export function NotificationPrefsCard(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [loaded, setLoaded] = useState<NotificationPrefs | null>(null);
  /*
   * The error itself rather than its message, so the effect below needs no translator (and does not refetch on a
   * language change), and a message on screen follows a language change.
   */
  const [failure, setFailure] = useState<ApiError | null>(null);

  useEffect(() => {
    void client.get<NotificationPrefs>('/me/notification-prefs').then((res) => {
      if (res.ok) setLoaded(res.data);
      else setFailure(res.error);
    });
  }, [client]);

  const [prefs, want] = useOptimistic<NotificationPrefs | null, NotificationPrefs>(
    loaded,
    (wanted, held) => client.put<NotificationPrefs>('/me/notification-prefs', prefsChange(wanted!, held!)),
    { fromAnswer: (data) => data, onFailed: setFailure },
  );

  const save = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setFailure(null);
      want((current) => (current ? { ...current, ...patch } : current));
    },
    [want],
  );

  const quiet = prefs ? quietEnabled(prefs) : false;

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('notifications.title')}</h2>

      {failure && <div className="msg msg-error" role="status">{describeError(failure, t)}</div>}

      {prefs === null ? (
        // The card with its words in place and only the switches waiting, so nothing below moves on arrival.
        <SkeletonRegion label={t('common.loading')}>
          <div aria-hidden="true">
            <ul className="section-toggles">
              {NOTIFICATION_CATEGORIES.map((category) => (
                <li key={category}>
                  <span className="section-toggle">
                    <Skeleton w={17} h={17} radius={4} style={{ marginTop: 3, flex: 'none' }} />
                    <span className="section-toggle-text">
                      <span className="section-toggle-label">{t(CATEGORY_LABEL[category as NotificationCategory])}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <h3 className="friend-heading" style={{ fontSize: 'var(--text)', marginBottom: 4 }}>
              {t('notifications.quietHours')}
            </h3>
            <p className="muted" style={{ fontSize: 'var(--text)', marginTop: 0, marginBottom: 10 }}>
              {t('notifications.quietHoursHelp')}
            </p>
            <span className="section-toggle" style={{ paddingTop: 0 }}>
              <Skeleton w={17} h={17} radius={4} style={{ marginTop: 3, flex: 'none' }} />
              <span className="section-toggle-text">
                <span className="section-toggle-label">{t('notifications.enableQuietHours')}</span>
              </span>
            </span>
          </div>
        </SkeletonRegion>
      ) : (
        <>
          <ul className="section-toggles">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <li key={category}>
                <label className="section-toggle">
                  <input
                    type="checkbox"
                    checked={prefs[category]}
                    onChange={(e) => save({ [category]: e.target.checked } as Partial<NotificationPrefs>)}
                  />
                  <span className="section-toggle-text">
                    <span className="section-toggle-label">{t(CATEGORY_LABEL[category as NotificationCategory])}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <h3 className="friend-heading" style={{ fontSize: 'var(--text)', marginBottom: 4 }}>
            {t('notifications.quietHours')}
          </h3>
          <p className="muted" style={{ fontSize: 'var(--text)', marginTop: 0, marginBottom: 10 }}>
            {t('notifications.quietHoursHelp')}
          </p>

          <label className="section-toggle" style={{ paddingTop: 0 }}>
            <input
              type="checkbox"
              checked={quiet}
              onChange={(e) => save(quietPatch(e.target.checked, prefs.quietStartMin, prefs.quietEndMin))}
            />
            <span className="section-toggle-text">
              <span className="section-toggle-label">{t('notifications.enableQuietHours')}</span>
            </span>
          </label>

          {/* The two ends exist only while quiet hours are on. */}
          {quiet && (
            <div className="toolbar" style={{ gap: 16, flexWrap: 'wrap' }}>
              <QuietEnd
                label={t('notifications.quietFrom')}
                value={prefs.quietStartMin}
                  onPick={(min) => save({ quietStartMin: min, quietEndMin: prefs.quietEndMin })}
              />
              <QuietEnd
                label={t('notifications.quietTo')}
                value={prefs.quietEndMin}
                  onPick={(min) => save({ quietStartMin: prefs.quietStartMin, quietEndMin: min })}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One end of quiet hours, as a native time input, which is localised and keyboard-friendly. A cleared or half-typed
 * field parses to null and sends nothing, so the window is never half set.
 */
function QuietEnd({ label, value, onPick }: { label: string; value: number | null; onPick: (min: number) => void }): React.JSX.Element {
  // The label sits over its field, so the two line up whatever their length.
  return (
    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span className="field-hint" style={{ margin: 0 }}>{label}</span>
      <input
        type="time"
        className="input"
        value={value === null ? '' : formatMinute(value)}
        onChange={(e) => {
          const min = parseMinute(e.target.value);
          if (min !== null) onPick(min);
        }}
      />
    </label>
  );
}
