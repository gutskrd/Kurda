import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import {
  CATEGORY_LABEL,
  NOTIFICATION_CATEGORIES,
  formatMinute,
  parseMinute,
  quietEnabled,
  quietPatch,
  type NotificationCategory,
  type NotificationPrefs,
} from './prefs';

/**
 * Which notifications you get, and when you would rather not (KUR-095).
 *
 * The browser could not change any of this: `GET`/`PUT /me/notification-prefs`
 * went uncalled, so somebody who signed up in a browser had no way to turn a
 * category off or set quiet hours short of installing the app. Consent for the
 * news-and-offers category in particular is a setting people expect to be able
 * to withdraw wherever they made it.
 *
 * Each control saves on change, the way the profile's section toggles beside it
 * do — a settings pane with a Save button invites you to leave without pressing
 * it. A failure puts the switch back where it was and says why.
 */
export function NotificationPrefsCard(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  /*
   * The error itself, not a sentence about it. Keeping the `ApiError` means the
   * effect below needs no translator — so it depends only on the client and does
   * not refetch a language-free payload every time the reader switches language
   * — and it means a message already on screen re-reads in the new language
   * instead of staying in the old one.
   */
  const [failure, setFailure] = useState<ApiError | null>(null);

  useEffect(() => {
    void client.get<NotificationPrefs>('/me/notification-prefs').then((res) => {
      if (res.ok) setPrefs(res.data);
      else setFailure(res.error);
    });
  }, [client]);

  /**
   * Send a patch, having already moved the control.
   *
   * Optimistic because a toggle that waits for a round trip before moving reads
   * as one that did not register, and people press it again. The previous value
   * is kept so a rejection can put it back rather than leave the screen claiming
   * a setting the server does not have.
   */
  const save = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setPrefs((current) => (current ? { ...current, ...patch } : current));
      setBusy(true);
      setFailure(null);
      void client.put<NotificationPrefs>('/me/notification-prefs', patch).then((res) => {
        setBusy(false);
        if (res.ok) setPrefs(res.data);
        else {
          setFailure(res.error);
          // the server is the truth about what is stored; ask it again
          void client
            .get<NotificationPrefs>('/me/notification-prefs')
            .then((again) => again.ok && setPrefs(again.data));
        }
      });
    },
    [client],
  );

  const quiet = prefs ? quietEnabled(prefs) : false;

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('notifications.title')}</h2>

      {failure && <div className="msg msg-error" role="status">{describeError(failure, t)}</div>}

      {prefs === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <>
          <ul className="section-toggles">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <li key={category}>
                <label className="section-toggle">
                  <input
                    type="checkbox"
                    checked={prefs[category]}
                    disabled={busy}
                    onChange={(e) => save({ [category]: e.target.checked } as Partial<NotificationPrefs>)}
                  />
                  <span className="section-toggle-text">
                    <span className="section-toggle-label">{t(CATEGORY_LABEL[category as NotificationCategory])}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <h3 className="friend-heading" style={{ fontSize: '0.95rem', marginBottom: 4 }}>
            {t('notifications.quietHours')}
          </h3>
          <p className="muted" style={{ fontSize: '0.92rem', marginTop: 0, marginBottom: 10 }}>
            {t('notifications.quietHoursHelp')}
          </p>

          <label className="section-toggle" style={{ paddingTop: 0 }}>
            <input
              type="checkbox"
              checked={quiet}
              disabled={busy}
              onChange={(e) => save(quietPatch(e.target.checked, prefs.quietStartMin, prefs.quietEndMin))}
            />
            <span className="section-toggle-text">
              <span className="section-toggle-label">{t('notifications.enableQuietHours')}</span>
            </span>
          </label>

          {/* the two ends only exist while the window does */}
          {quiet && (
            <div className="toolbar" style={{ gap: 16, flexWrap: 'wrap' }}>
              <QuietEnd
                label={t('notifications.quietFrom')}
                value={prefs.quietStartMin}
                disabled={busy}
                onPick={(min) => save({ quietStartMin: min, quietEndMin: prefs.quietEndMin })}
              />
              <QuietEnd
                label={t('notifications.quietTo')}
                value={prefs.quietEndMin}
                disabled={busy}
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
 * One end of the window.
 *
 * A native time input rather than the phone's pair of half-hour steppers: the
 * browser has one, it is already localised to how the reader writes a time, and
 * it reaches the keyboard for free. A cleared or half-typed field parses to null
 * and sends nothing, so the window is never left half set.
 */
function QuietEnd({
  label,
  value,
  disabled,
  onPick,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onPick: (min: number) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="field-hint" style={{ margin: 0 }}>{label}</span>
      <input
        type="time"
        className="input"
        disabled={disabled}
        value={value === null ? '' : formatMinute(value)}
        onChange={(e) => {
          const min = parseMinute(e.target.value);
          if (min !== null) onPick(min);
        }}
      />
    </label>
  );
}
