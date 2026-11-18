import { CloseIcon } from './icons';

/**
 * The one close button for dialogs, sheets, panels and toasts: a drawn ✕ in a 44px round button on an opaque ground so it
 * reads over artwork (styles/ui.css `.close-btn`). `className` only places it. `label` is required, since "Close" alone
 * does not say which of two open things it closes.
 */
export function CloseButton({
  label,
  onClick,
  className,
  disabled,
}: {
  /** What it closes, in words: the accessible name. */
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button type="button" className={`close-btn${className ? ` ${className}` : ''}`} aria-label={label} onClick={onClick} disabled={disabled}>
      <CloseIcon size={18} />
    </button>
  );
}
