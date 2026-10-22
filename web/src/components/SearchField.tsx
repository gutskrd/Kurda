import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react';
import { CloseIcon, SearchIcon } from './icons';
import { useT } from '../i18n/I18nProvider';

/**
 * Marks a field that empties itself on Escape. A sheet or dialog it sits in
 * leaves that Escape to the field (`escapeClearsField`), so the first Escape
 * takes back what was typed and only the next one closes.
 */
const CLEARS_ON_ESCAPE = 'data-clears-on-escape';

/** Whether this Escape belongs to a search field with words in it, rather than to the sheet around it. */
export function escapeClearsField(e: KeyboardEvent): boolean {
  const target = e.target;
  return target instanceof HTMLInputElement && target.hasAttribute(CLEARS_ON_ESCAPE) && target.value.length > 0;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'className'>;

export interface SearchFieldProps extends InputProps {
  value: string;
  onValueChange: (next: string) => void;
  /** a magnifier at the start of the field */
  icon?: boolean;
  /** on the wrapper, which places the magnifier and the clear button */
  className?: string;
  /** on the input itself, for its height, its corners and its type size */
  inputClassName?: string;
}

/**
 * A search field: the words, and a clear button at the end once there are
 * words to clear.
 *
 * The button empties the field and leaves the cursor in it, ready for the next
 * search: pressing it does not take the focus first (`onMouseDown`), so a
 * phone's keyboard stays up rather than dropping and rising again. Escape does
 * the same while there is something to clear. The browser's own clear button
 * is hidden (ui.css): it is drawn differently in each browser, and not at
 * all in some, and two crosses would be one too many.
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
          // ours, not the browser's (which some do and some do not) nor the sheet's
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
