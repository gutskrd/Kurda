import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { giftSoundOn, setGiftSound } from './motion';
import { autoplayOn, characterVoicesOn, lessonSoundsOn, playLessonSound, setAutoplay, setCharacterVoices, setLessonSounds } from '../lib/sounds';

/**
 * Settings → Sounds: the gift chime, lesson answer and end sounds (lib/sounds.ts), whether an answer's Kurdish is
 * spoken after the verdict, and the characters' reaction lines. Turning lesson sounds on plays one. Stored per device;
 * under Reduce Motion there is no chime either way.
 */
export function GiftSoundSetting(): React.JSX.Element {
  const t = useT();
  const [on, setOn] = useState(giftSoundOn);
  const [lesson, setLesson] = useState(lessonSoundsOn);
  const [autoplay, setAutoplayOn] = useState(autoplayOn);
  const [voices, setVoices] = useState(characterVoicesOn);
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
      <label className="section-toggle">
        <input
          type="checkbox"
          checked={lesson}
          onChange={(e) => {
            setLesson(e.target.checked);
            setLessonSounds(e.target.checked);
            if (e.target.checked) playLessonSound('correct');
          }}
        />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('settings.sounds.lesson')}</span>
          <span className="section-toggle-hint">{t('settings.sounds.lessonHint')}</span>
        </span>
      </label>
      <label className="section-toggle">
        <input
          type="checkbox"
          checked={autoplay}
          onChange={(e) => {
            setAutoplayOn(e.target.checked);
            setAutoplay(e.target.checked);
          }}
        />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('settings.sounds.autoplay')}</span>
          <span className="section-toggle-hint">{t('settings.sounds.autoplayHint')}</span>
        </span>
      </label>
      <label className="section-toggle">
        <input
          type="checkbox"
          checked={voices}
          onChange={(e) => {
            setVoices(e.target.checked);
            setCharacterVoices(e.target.checked);
          }}
        />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('settings.sounds.characterVoices')}</span>
          <span className="section-toggle-hint">{t('settings.sounds.characterVoicesHint')}</span>
        </span>
      </label>
    </section>
  );
}
