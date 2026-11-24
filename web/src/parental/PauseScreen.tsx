import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupervisionState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { MoonIcon, TimerIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import { clockAt } from './api';

/**
 * What a supervised teen sees in place of Hevalo while it rests: a moon for bedtime, a timer for a day used up, and one
 * calm line on when it opens again. Two ways on: to see what their parent set, or to sign out, since a parent may share
 * the device. Nothing here counts down, so it never hurries anyone.
 */
export function PauseScreen({ state }: { state: SupervisionState }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const title = useRef<HTMLHeadingElement>(null);
  const bedtime = state.paused === 'bedtime';

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);

  const until = state.resumesAt ? clockAt(state.resumesAt, state.timeZone, locale) : (state.controls.bedtime?.to ?? '');
  const line = bedtime
    ? t('parental.pause.bedtimeBody', { time: until })
    : t('parental.pause.limitBody', { count: state.controls.dailyLimitMinutes ?? state.minutesToday });

  return (
    <main className="parental-pause" aria-labelledby="parental-pause-title">
      <div className="parental-pause-inner">
        <span className="parental-pause-glyph" aria-hidden="true">
          {bedtime ? <MoonIcon size={40} /> : <TimerIcon size={40} />}
        </span>
        <h1 className="parental-pause-title" id="parental-pause-title" ref={title} tabIndex={-1}>
          {t(bedtime ? 'parental.pause.bedtimeTitle' : 'parental.pause.limitTitle')}
        </h1>
        <p className="parental-pause-line">{line}</p>
        <div className="parental-pause-actions">
          <Button variant="secondary" onClick={() => navigate('/app/settings/parental')}>
            {t('parental.title')}
          </Button>
          <Button variant="ghost" onClick={() => void logout().then(() => navigate('/'))}>
            {t('settings.sessions.signOut')}
          </Button>
        </div>
      </div>
    </main>
  );
}
