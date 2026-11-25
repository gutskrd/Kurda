import { useState } from 'react';
import { SHOWCASE_SIZE, type ShowcaseBadge } from '@kurda/shared';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useT } from '../i18n/I18nProvider';
import { badgeNamed } from '../ranks/names';
import { Medal } from './parts';

/**
 * The profile's three badges, picked in the order tapped; a fourth is refused with a message rather than replacing one.
 * The choices alone sit in the profile's collection sheet; `ShowcasePicker` holds them in a dialog for the badges page.
 */
export function ShowcaseChoices({
  badges,
  keys,
  onChange,
}: {
  badges: readonly ShowcaseBadge[];
  keys: readonly string[];
  onChange: (keys: string[]) => void;
}): React.JSX.Element {
  const t = useT();
  const full = keys.length >= SHOWCASE_SIZE;

  function toggle(key: string): void {
    onChange(keys.includes(key) ? keys.filter((x) => x !== key) : full ? [...keys] : [...keys, key]);
  }

  return (
    <>
      <p className="muted">{t('badges.showcase.help')}</p>
      <p className="showcase-picker-count" aria-live="polite">
        {t('badges.showcase.chosen', { count: keys.length, max: SHOWCASE_SIZE })}
      </p>
      <ul className="showcase-picker-grid">
        {badges.map((b) => {
          const on = keys.includes(b.key);
          const name = badgeNamed(t, b.key).name;
          return (
            <li key={b.key}>
              <button type="button" className={`showcase-pick${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => toggle(b.key)}>
                <Medal view={b} size={60} shine={false} />
                <span className="showcase-pick-name">{name}</span>
                {on && <span className="showcase-pick-order">{keys.indexOf(b.key) + 1}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {full && <p className="story-setup-note">{t('badges.showcase.full')}</p>}
    </>
  );
}

/** The choices in a dialog of their own, saved together. */
export function ShowcasePicker({
  badges,
  initial,
  onClose,
  onSaved,
}: {
  badges: readonly ShowcaseBadge[];
  initial: readonly string[];
  onClose: () => void;
  onSaved: (keys: string[]) => void;
}): React.JSX.Element {
  const t = useT();
  const [keys, setKeys] = useState<string[]>(initial.filter((k) => badges.some((b) => b.key === k)));
  return (
    <Modal open onClose={onClose} label={t('badges.showcase.title')}>
      <div className="showcase-picker">
        <h2 className="story-setup-title">{t('badges.showcase.title')}</h2>
        <ShowcaseChoices badges={badges} keys={keys} onChange={setKeys} />
        <div className="story-setup-submit">
          <Button size="lg" block onClick={() => onSaved(keys)}>
            {t('badges.showcase.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
