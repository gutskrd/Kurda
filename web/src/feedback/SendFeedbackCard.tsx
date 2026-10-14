import { useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useT } from '../i18n/I18nProvider';
import { RatingBox } from './RatingBox';

/**
 * Settings → Send feedback: the rating box's form, any time, without its
 * once-only rule (source `settings`). It reaches the same inbox the admin
 * reads. There is no store link on the web, here or anywhere.
 */
export function SendFeedbackCard(): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <section className="card" style={{ marginTop: 20 }} aria-labelledby="settings-feedback">
      <h2 className="friend-heading" id="settings-feedback" style={{ marginTop: 0 }}>
        {t('appFeedback.settingsTitle')}
      </h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('appFeedback.settingsHelp')}
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('appFeedback.sendRow')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} label={t('appFeedback.settingsTitle')}>
        <RatingBox source="settings" onClose={() => setOpen(false)} />
      </Modal>
    </section>
  );
}
