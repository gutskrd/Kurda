import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react';
import { CloseIcon, SearchIcon } from './icons';
import { useT } from '../i18n/I18nProvider';

/** Marks a field that empties on Escape; a sheet around it leaves that Escape to the field (`escapeClearsField`). */
const CLEARS_ON_ESCAPE = 'data-clears-on-escape';

/** Whether this Escape belongs to a search field with words in it rather than to the sheet around it. */
export function escapeClearsField(e: KeyboardEvent): boolean {
  const target = e.target;
  return target instanceof HTMLInputElement && target.hasAttribute(CLEARS_ON_ESCAPE) && target.value.length > 0;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'className'>;

export interface SearchFieldProps extends InputProps {
  value: string;
  onValueChange: (next: string) => void;
  /** A magnifier at the start of the field. */
  icon?: boolean;
  /** On the wrapper, which places the magnifier and the clear button. */
  className?: string;
  /** On the input, for its height, corners and type size. */
  inputClassName?: string;
}

/**
 * A search field with a clear button once there are words. Clearing keeps focus in the field (`onMouseDown`) so a
 * phone's keyboard stays up; Escape does the same. The browser's own clear button is hidden (ui.css).
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, icon = false, className, inputClassName, onKeyDown, ...input },
  ref,
) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => field.current as HTMLInputElement);

  const clear = (): void => {
    onValueChange('');
    field.current?.focus();
  };

  return (
    <div className={['search-box', icon ? 'has-icon' : '', className ?? ''].filter(Boolean).join(' ')}>
      {icon && <SearchIcon size={18} className="search-box-icon" />}
      <input
        {...input}
        ref={field}
        type="search"
        className={['input', 'search-box-input', inputClassName ?? ''].filter(Boolean).join(' ')}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        {...{ [CLEARS_ON_ESCAPE]: '' }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || e.key !== 'Escape' || !value) return;
          // Ours, not the browser's nor the sheet's.
          e.preventDefault();
          e.stopPropagation();
          clear();
        }}
      />
      {value && (
        <button
          type="button"
          className="search-box-clear"
          aria-label={t('search.clear')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
});
