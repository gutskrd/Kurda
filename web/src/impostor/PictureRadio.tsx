import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import './start.css';

export interface PictureOption<T extends string> {
  value: T;
  label: string;
  /** a second, quieter line: what a way to play does, what a category's name means */
  hint?: string;
  /** The label's language when it differs from the page's, such as a Kurdish name among translated choices. */
  lang?: string;
  /** the picture, already drawn */
  art: ReactNode;
  /** the picture's own colour, which tints the choice */
  tone: string;
}

/** A name longer than this is set a size smaller on a tile, so it breaks between words or not at all. */
const LONG = 9;

/**
 * A choice among pictures as a fieldset of native radios (like play/ChipRadio.tsx), each with picture, name and a line,
 * and a tick as well as colour on the chosen one. `cards` stack wide choices that need a sentence, `tiles` grid many
 * small ones, and `strip` scrolls a row of tiles where there is no room for a grid.
 */
export function PictureRadio<T extends string>({
  label,
  step,
  value,
  options,
  onChange,
  layout,
  first,
  moreLabel,
}: {
  label: string;
  /** the place of this choice in a setup with numbered steps, shown before its name */
  step?: number;
  value: T;
  options: ReadonlyArray<PictureOption<T>>;
  onChange: (next: T) => void;
  layout: 'cards' | 'tiles' | 'strip';
  /** how many choices show before the rest are asked for; all of them when left out */
  first?: number;
  /** what the button that shows the rest says, given how many they are */
  moreLabel?: (count: number) => string;
}): React.JSX.Element {
  const name = useId();
  const [all, setAll] = useState(false);
  const folded = !all && first !== undefined && moreLabel !== undefined && options.length > first;
  // the chosen one is never folded away: a choice nobody can see is not a choice
  const shown = folded ? options.filter((o, i) => i < first || o.value === value) : options;
  return (
    <fieldset className={`pic-radio is-${layout}`} role="radiogroup">
      <legend className={step ? 'couch-step-title' : 'chip-radio-legend'}>
        {step ? (
          <span className="couch-step-n" aria-hidden="true">
            {step}
          </span>
        ) : null}
        {label}
      </legend>
      <div className="pic-radio-options">
        {shown.map((o) => (
          <label key={o.value} className={`pic-option${o.value === value ? ' is-on' : ''}${o.label.length > LONG ? ' is-long' : ''}`} style={{ '--tone': o.tone } as CSSProperties}>
            <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span className="pic-option-art">{o.art}</span>
            <span className="pic-option-text">
              <span className="pic-option-label" lang={o.lang}>
                {o.label}
              </span>
              {o.hint ? <span className="pic-option-hint">{o.hint}</span> : null}
            </span>
            <span className="pic-option-tick" aria-hidden="true" />
          </label>
        ))}
      </div>
      {folded ? (
        <button type="button" className="btn btn-ghost btn-sm pic-radio-more" onClick={() => setAll(true)}>
          {moreLabel(options.length - shown.length)}
        </button>
      ) : null}
    </fieldset>
  );
}
