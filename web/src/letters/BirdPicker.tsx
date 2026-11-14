import { useId } from 'react';
import { LETTER_BIRDS, LETTER_BIRD_PRICE } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { useLocale, useT } from '../i18n/I18nProvider';
import { BirdBadge } from './LetterParts';

/** Each bird by its colour, for whoever cannot see the picture: in the order of the shared LETTER_BIRDS. */
export const BIRD_NAMES: readonly MessageKey[] = [
  'letters.bird.lavender',
  'letters.bird.sky',
  'letters.bird.rose',
  'letters.bird.green',
  'letters.bird.orange',
  'letters.bird.teal',
  'letters.bird.yellow',
  'letters.bird.violet',
];

/**
 * Choosing your bird, under your window, where the bird on the sill takes
 * the colour of whichever is picked (LettersPage shows it there).
 *
 * The first bird is chosen for free and is yours from then on; another after
 * it costs Zêr (shared LETTER_BIRD_PRICE), and the picker says so, and how
 * much there is, before anything is paid. The birds are a row of radio
 * buttons, so a keyboard moves through them with the arrow keys and a screen
 * reader says each by its colour.
 */
export function BirdPicker({
  first,
  current,
  picked,
  zer,
  busy,
  error,
  onPick,
  onConfirm,
  onCancel,
}: {
  /** choosing for the first time, for free; otherwise changing, for Zêr */
  first: boolean;
  current: number;
  picked: number;
  zer: number;
  busy: boolean;
  error: string | null;
  onPick: (bird: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const short = first ? 0 : Math.max(0, LETTER_BIRD_PRICE - zer);
  const same = !first && picked === current;
  return (
    <div className="letters-picker">
      <p id={titleId} className="letters-status letters-status--strong">
        {first ? t('letters.bird.chooseTitle') : t('letters.bird.changeTitle')}
      </p>
      <p className="letters-status">{first ? t('letters.bird.chooseLead', { price: number(LETTER_BIRD_PRICE) }) : t('letters.bird.changeLead', { price: number(LETTER_BIRD_PRICE), zer: number(zer) })}</p>
      <fieldset className="letters-birds" aria-labelledby={titleId}>
        {LETTER_BIRDS.map((_, bird) => (
          <label key={bird} className={`letters-bird${bird === picked ? ' is-picked' : ''}`}>
            <input type="radio" name="letter-bird" className="sr-only" checked={bird === picked} onChange={() => onPick(bird)} disabled={busy} />
            <BirdBadge bird={bird} size={48} />
            <span className="sr-only">{!first && bird === current ? t('letters.bird.yours', { name: t(BIRD_NAMES[bird]!) }) : t(BIRD_NAMES[bird]!)}</span>
            {!first && bird === current && <span className="letters-bird-mine" aria-hidden="true" />}
          </label>
        ))}
      </fieldset>
      {short > 0 && <p className="letters-status">{t('letters.bird.short', { count: number(short) })}</p>}
      {error && (
        <p className="letters-picker-error" role="alert">
          {error}
        </p>
      )}
      <div className="letters-picker-actions">
        <button type="button" className="btn btn-primary letters-write" onClick={onConfirm} disabled={busy || same || short > 0}>
          {first ? t('letters.bird.choose') : t('letters.bird.buy', { price: number(LETTER_BIRD_PRICE) })}
        </button>
        {!first && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            {t('letters.bird.keep')}
          </button>
        )}
      </div>
    </div>
  );
}
