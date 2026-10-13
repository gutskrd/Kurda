import { useId } from 'react';

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
  /** a second, quieter line ("~2 min") */
  hint?: string;
}

/**
 * A choice of presets: real radio buttons, drawn as chips.
 *
 * The games' pickers were tab lists — `role="tab"` buttons with nothing for
 * them to be tabs of — so a screen reader announced "tab 2 of 3" for
 * "Medium" and the arrow keys did nothing. These are native radios in a
 * fieldset: the group has its name, arrow keys move the choice (mirrored in
 * a right-to-left page, as the browser does it), and each chip is at least
 * 44 px tall.
 */
export function ChipRadio<T extends string | number>({
  label,
  value,
  options,
  onChange,
  name,
  hideLabel = false,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<ChipOption<T>>;
  onChange: (next: T) => void;
  /** defaults to a unique one; give one when two groups must not share */
  name?: string;
  /** the label is for screen readers only (the context says it already) */
  hideLabel?: boolean;
  className?: string;
}): React.JSX.Element {
  const auto = useId();
  const groupName = name ?? auto;
  return (
    <fieldset className={`chip-radio${className ? ` ${className}` : ''}`} role="radiogroup">
      <legend className={hideLabel ? 'sr-only' : 'chip-radio-legend'}>{label}</legend>
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
            <span className="chip-radio-label">{o.label}</span>
            {o.hint && <span className="chip-radio-hint">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
