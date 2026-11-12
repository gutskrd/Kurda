import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import './start.css';

export interface PictureOption<T extends string> {
  value: T;
  label: string;
  /** a second, quieter line: what a way to play does, what a category's name means */
  hint?: string;
  /** the language of the label, when it is not the page's (a Kurdish name among choices in the reader's language) */
  lang?: string;
  /** the picture, already drawn */
  art: ReactNode;
  /** the picture's own colour, which tints the choice */
  tone: string;
}

/** A name longer than this is set a size smaller on a tile, so it breaks between words or not at all. */
const LONG = 9;

/**
 * A choice among pictures: real radio buttons, each drawn as a card with its
 * picture, its name and a line under it.
 *
 * Three shapes for three places. `cards` are wide, one under another, for a
 * few choices that each need a sentence (the ways to play). `tiles` are a
 * grid of small squares for many choices known at a glance (the categories).
 * `strip` is one row of tiles that scrolls sideways, where a sheet has no
 * room for a grid.
 *
 * It is a fieldset of native radios, as the chips are (play/ChipRadio.tsx):
 * the group has its name, the arrow keys move the choice, and the chosen one
 * is told by a tick as well as by its colour.
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
