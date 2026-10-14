import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { giftSoundOn, setGiftSound } from './motion';

/**
 * Settings → Sounds: whether opening a gift chimes.
 *
 * On this device only, like the other things a browser remembers for itself
 * (it is a matter of where you are — a classroom, a bus — not of who you are).
 * With reduced motion asked for, there is no chime either way.
 */
export function GiftSoundSetting(): React.JSX.Element {
  const t = useT();
  const [on, setOn] = useState(giftSoundOn);
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('settings.sounds.title')}
      </h2>
      <label className="section-toggle" style={{ paddingTop: 0 }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            setGiftSound(e.target.checked);
          }}
        />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('settings.sounds.giftChime')}</span>
          <span className="section-toggle-hint">{t('settings.sounds.giftChimeHint')}</span>
        </span>
      </label>
    </section>
  );
}
