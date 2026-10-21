import { useId } from 'react';
import { ACCENT_MODES, type AccentMode } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useKeyboardPrefs, type WordleLayout } from './prefs';

const ACCENT_LABEL: Record<AccentMode, MessageKey> = {
  strict: 'keyboard.accent.strict',
  forgiving: 'keyboard.accent.forgiving',
  hidden: 'keyboard.accent.hidden',
};

const ACCENT_HINT: Record<AccentMode, MessageKey> = {
  strict: 'keyboard.accent.strictHint',
  forgiving: 'keyboard.accent.forgivingHint',
  hidden: 'keyboard.accent.hiddenHint',
};

const LAYOUTS: Array<{ value: WordleLayout; label: MessageKey }> = [
  { value: 'qwerty', label: 'keyboard.wordle.qwerty' },
  { value: 'alphabet', label: 'keyboard.wordle.alphabet' },
];

/**
 * How this device types Kurdish: accents, the letter keys, the backtick
 * shortcut, Peyvok's layout — and the way back to the keyboard guide.
 *
 * The same controls in the race's own settings and in Settings, so a choice
 * made in one is the choice in the other (they share one store, `prefs`). Each
 * change applies at once; there is nothing to save. A race keeps the accent
 * mode it started with — the server scored it that way — so the race screen
 * says a change counts from the next one.
 */
export function KeyboardSettings({
  context,
  onHelp,
}: {
  /** the race shows its own note about the race in progress; Settings shows Peyvok's layout too */
  context: 'race' | 'settings';
  onHelp: () => void;
}): React.JSX.Element {
  const t = useT();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const id = useId();

  return (
    <div className="kb-settings">
      <fieldset className="kb-fieldset">
        <legend className="kb-legend">{t('keyboard.accent.title')}</legend>
        <div className="kb-options">
          {ACCENT_MODES.map((mode) => (
            <label key={mode} className={`kb-option${prefs.accentMode === mode ? ' is-on' : ''}`}>
              <input
                type="radio"
                name={`${id}-accent`}
                value={mode}
                checked={prefs.accentMode === mode}
                onChange={() => setPrefs({ accentMode: mode })}
              />
              <span className="kb-option-text">
                <span className="kb-option-label">{t(ACCENT_LABEL[mode])}</span>
                <span className="kb-option-hint">{t(ACCENT_HINT[mode])}</span>
              </span>
            </label>
          ))}
        </div>
        {context === 'race' && <p className="field-hint kb-note">{t('keyboard.accent.nextRace')}</p>}
      </fieldset>

      <label className="section-toggle kb-toggle">
        <input type="checkbox" checked={prefs.keyBar} onChange={(e) => setPrefs({ keyBar: e.target.checked })} />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('keyboard.keyBar.title')}</span>
          <span className="section-toggle-hint">{t('keyboard.keyBar.hint')}</span>
        </span>
      </label>

      <label className="section-toggle kb-toggle">
        <input type="checkbox" checked={prefs.backtick} onChange={(e) => setPrefs({ backtick: e.target.checked })} />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('keyboard.backtick.title')}</span>
          <span className="section-toggle-hint">{t('keyboard.backtick.hint')}</span>
        </span>
      </label>

      {context === 'settings' && (
        <fieldset className="kb-fieldset">
          <legend className="kb-legend">{t('keyboard.wordle.title')}</legend>
          <div className="toolbar kb-chips">
            {LAYOUTS.map((l) => (
              <label key={l.value} className={`chip kb-chip${prefs.wordleLayout === l.value ? ' active' : ''}`}>
                <input
                  type="radio"
                  className="kb-chip-input"
                  name={`${id}-layout`}
                  value={l.value}
                  checked={prefs.wordleLayout === l.value}
                  onChange={() => setPrefs({ wordleLayout: l.value })}
                />
                {t(l.label)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button type="button" className="btn btn-secondary btn-sm kb-help" onClick={onHelp}>
        {t('keyboard.help')}
      </button>
    </div>
  );
}
