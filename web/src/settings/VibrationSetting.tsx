import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { canVibrate, haptic, setVibration, vibrationOn } from '../lib/haptics';

/**
 * Settings → Vibration: whether this device buzzes for a right answer, a
 * wrong one and a moment worth marking (lib/haptics.ts).
 *
 * Shown only where it can mean something — a touch screen whose browser can
 * vibrate (not a laptop, and not Safari on an iPhone, which cannot). On this
 * device only, like the gift chime beside it: it is about where you are, not
 * who you are. Turning it on is felt, so the switch shows what it does.
 */
export function VibrationSetting(): React.JSX.Element | null {
  const t = useT();
  const [on, setOn] = useState(vibrationOn);
  const [able] = useState(canVibrate);
  if (!able) return null;
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('settings.vibration.title')}
      </h2>
      <label className="section-toggle" style={{ paddingTop: 0 }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            setVibration(e.target.checked);
            if (e.target.checked) haptic('correct');
          }}
        />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('settings.vibration.toggle')}</span>
          <span className="section-toggle-hint">{t('settings.vibration.hint')}</span>
        </span>
      </label>
    </section>
  );
}
