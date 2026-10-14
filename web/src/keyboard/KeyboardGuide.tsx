import { useId, useMemo, useState } from 'react';
import { KEYBOARD_PLATFORMS, type KeyboardPlatform, type TypingDialect } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { HevaloDeer } from '../feedback/HevaloDeer';
import { useKeyboardPrefs } from './prefs';
import { GUIDE_STEP_KEYS, PLATFORM_NAME, browserPlatform, guideSteps, lettersTyped, stepParts, tryLetters } from './guide';

/**
 * "Get the Kurmancî keyboard" — Hevalo the deer shows the way (contract §K3).
 *
 * Shown before the first Kurmancî race on this device, on a race's result
 * after three or more accented letters went in without their accent, and any
 * time from "Keyboard help" in the race's settings and in Settings.
 *
 * Only this device's steps: the platform is read from the browser, and
 * "another device?" lists the rest for somebody setting up a phone from a
 * laptop. The device's own menu names stay in English, set apart, because
 * that is what the screen they are looking for will say. Then a box to try
 * the new keyboard in, where each letter lights up as it arrives and the deer
 * hops when all five are in — and two ways out for anyone without the minute
 * to spare: the on-screen keys, or gentler accents.
 */
export function KeyboardGuide({
  dialect,
  onClose,
  closeLabel,
  headingLevel = 2,
  quietClose = false,
}: {
  /** the closing button as a quiet one, where another action on the page is the main one */
  quietClose?: boolean;
  dialect: TypingDialect;
  onClose: () => void;
  /** what the button that closes it says: "Start the race" when it stands before one */
  closeLabel?: string;
  headingLevel?: 2 | 3;
}): React.JSX.Element {
  const t = useT();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const detected = useMemo(browserPlatform, []);
  const [platform, setPlatform] = useState<KeyboardPlatform | null>(detected);
  const [tried, setTried] = useState('');
  const ids = useId();
  const sorani = dialect === 'sorani';
  const lang = sorani ? 'ckb' : 'ku';
  const dir = sorani ? 'rtl' : 'ltr';
  const letters = tryLetters(dialect);
  const typed = lettersTyped(dialect, tried);
  const allIn = typed.size === letters.length;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const SubHeading = headingLevel === 2 ? 'h3' : 'h4';
  // the gentler accent mode one step on from this device's, if there is one
  const nextMode = prefs.accentMode === 'strict' ? 'forgiving' : prefs.accentMode === 'forgiving' ? 'hidden' : null;
  // the key bar is on, and the race shows it (a Kurmancî race without accents has none)
  const keysAbove = prefs.keyBar && (sorani || prefs.accentMode !== 'hidden');

  return (
    <section className="kb-guide" aria-labelledby={`${ids}-title`}>
      <div className="kb-guide-head">
        <HevaloDeer size={112} board={{ kind: 'letters', letters: letters.join(' '), lang, dir }} cheer={allIn} />
        <div className="kb-guide-intro">
          <Heading className="kb-guide-title" id={`${ids}-title`}>
            {sorani ? t('keyboard.guide.titleSorani') : t('keyboard.guide.title')}
          </Heading>
          <p className="kb-guide-lead">{sorani ? t('keyboard.guide.leadSorani') : t('keyboard.guide.lead')}</p>
        </div>
      </div>

      <div className="kb-guide-device">
        <label className="field-label" htmlFor={`${ids}-device`}>
          {platform ? t('keyboard.guide.yourDevice') : t('keyboard.guide.whichDevice')}
        </label>
        <select
          id={`${ids}-device`}
          className="input kb-guide-select"
          value={platform ?? ''}
          onChange={(e) => setPlatform((e.target.value || null) as KeyboardPlatform | null)}
        >
          {!platform && <option value="">{t('keyboard.guide.chooseDevice')}</option>}
          {KEYBOARD_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {t(PLATFORM_NAME[p])}
            </option>
          ))}
        </select>
      </div>

      {platform && (
        <ol className="kb-guide-steps">
          {guideSteps(platform, dialect).map((step) => {
            const key = GUIDE_STEP_KEYS[step.key];
            const sentence = key ? t(key) : step.en;
            return (
              <li key={step.key}>
                {stepParts(step, sentence).map((part, i) =>
                  part.ui ? (
                    <b key={i} className="kb-guide-ui" lang="en" dir="ltr">
                      {part.text}
                    </b>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className={`kb-try${allIn ? ' is-done' : ''}`}>
        <SubHeading className="kb-try-title">
          <label htmlFor={`${ids}-try`}>{t('keyboard.guide.tryIt', { letters: letters.join(' ') })}</label>
        </SubHeading>
        <ul className="kb-try-letters" aria-label={t('keyboard.guide.progress', { done: typed.size, total: letters.length })}>
          {letters.map((l) => (
            <li key={l} className={`kb-try-letter${typed.has(l) ? ' is-on' : ''}`} lang={lang}>
              <span aria-hidden="true">{l}</span>
              <span className="sr-only">
                {typed.has(l) ? t('keyboard.guide.letterDone', { letter: l }) : t('keyboard.guide.letterToGo', { letter: l })}
              </span>
            </li>
          ))}
        </ul>
        <input
          id={`${ids}-try`}
          className="input kb-try-input"
          value={tried}
          onChange={(e) => setTried(e.target.value.slice(0, 200))}
          lang={lang}
          dir={dir}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <p className="kb-try-status" role="status">
          {allIn ? t('keyboard.guide.allIn') : typed.size > 0 ? t('keyboard.guide.progress', { done: typed.size, total: letters.length }) : ''}
        </p>
        {allIn && (
          <span className="kb-confetti" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} style={{ ['--i' as string]: i }} />
            ))}
          </span>
        )}
      </div>

      {/*
        Each way out changes something: with the key bar already on, it is
        pointed at rather than offered; with accents already forgiving, the
        next step is none at all. With nothing left to change, nothing is shown.
      */}
      {(keysAbove || !prefs.keyBar || nextMode) && (
        <div className="kb-guide-outs">
          <p className="kb-guide-outs-lead">{t('keyboard.guide.noTime')}</p>
          {keysAbove && (
            <p className="kb-guide-keys-note" lang={lang} dir={dir}>
              {t('keyboard.guide.keysAbove', { letters: letters.join(' ') })}
            </p>
          )}
          {(!prefs.keyBar || nextMode) && (
            <div className="kb-guide-out-buttons">
              {!prefs.keyBar && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPrefs({ keyBar: true });
                    onClose();
                  }}
                >
                  {t('keyboard.guide.useKeys')}
                </button>
              )}
              {nextMode && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPrefs({ accentMode: nextMode });
                    onClose();
                  }}
                >
                  {nextMode === 'forgiving' ? t('keyboard.guide.forgiving') : t('keyboard.guide.noAccents')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button type="button" className={`btn ${quietClose ? 'btn-ghost' : 'btn-primary'} kb-guide-close`} onClick={onClose}>
        {closeLabel ?? t('keyboard.guide.done')}
      </button>
    </section>
  );
}
