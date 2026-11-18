import { useId } from 'react';

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
  /** A second, quieter line ("~2 min"). */
  hint?: string;
  /** The label's language when it is not the page's (a Kurdish word among choices in the reader's language). */
  lang?: string;
}

/**
 * A choice of presets as native radios in a fieldset, drawn as chips at least 44px tall: the group is named, and the
 * arrow keys move the choice (mirrored right to left).
 */
export function ChipRadio<T extends string | number>({
  label,
  value,
  options,
  onChange,
  name,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<ChipOption<T>>;
  onChange: (next: T) => void;
  /** Defaults to a unique one; give one when two groups must not share. */
  name?: string;
  className?: string;
}): React.JSX.Element {
  const auto = useId();
  const groupName = name ?? auto;
  return (
    <fieldset className={`chip-radio${className ? ` ${className}` : ''}`} role="radiogroup">
      <legend className="chip-radio-legend">{label}</legend>
      <div className="chip-radio-options">
        {options.map((o) => (
          <label key={String(o.value)} className={`chip-radio-option${o.value === value ? ' is-on' : ''}`}>
            <input
              type="radio"
              name={groupName}
              value={String(o.value)}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span className="chip-radio-label" lang={o.lang}>
              {o.label}
            </span>
            {o.hint && <span className="chip-radio-hint">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
