import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useI18n, useT } from '../i18n/I18nProvider';
import { KeyboardGuide } from './KeyboardGuide';
import { KeyboardSettings } from './KeyboardSettings';
import { useKeyboardPrefs } from './prefs';

/** Settings → Keyboard and accents: this device's race keyboard settings, Peyvok's layout and the keyboard guide. */
export function KeyboardCard(): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const [prefs] = useKeyboardPrefs();
  const [guideOpen, setGuideOpen] = useState(false);
  // The guide for the variety this device last raced in, else the interface's.
  const dialect = prefs.raceDialect ?? (locale === 'ckb' ? 'sorani' : 'kurmanci');

  return (
    <>
      <section className="card" style={{ marginTop: 20 }} aria-labelledby="settings-keyboard">
        <h2 className="friend-heading" id="settings-keyboard" style={{ marginTop: 0 }}>
          {t('keyboard.settings.title')}
        </h2>
        <p className="muted" style={{ fontSize: 'var(--text)', marginBottom: 14 }}>
          {t('keyboard.settings.help')}
        </p>
        <KeyboardSettings context="settings" onHelp={() => setGuideOpen(true)} />
      </section>
      {/* Beside the frosted card, not in it, since its backdrop filter would trap the fixed dialog. */}
      <Modal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        label={dialect === 'sorani' ? t('keyboard.guide.titleSorani') : t('keyboard.guide.title')}
      >
        <KeyboardGuide dialect={dialect} onClose={() => setGuideOpen(false)} />
      </Modal>
    </>
  );
}
