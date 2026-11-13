import { CloseIcon } from './icons';

/**
 * The one close button: a dialog's, a sheet's, a panel's, a toast's.
 *
 * There were eight of them — a dark glass disc on a dialog, a bordered pill
 * on a sheet, a 26px square in a menu, a typed "×" on a toast — each a
 * different size, and most of them smaller than a finger. Closing is the same
 * act wherever it is offered, so it is one control: the drawn ✕ in a round
 * button 44px across, in the scheme's own surface and ink (styles/ui.css,
 * `.close-btn`). Its ground is opaque, because a dialog can hold a profile's
 * artwork and the button has to read on a photograph as well as on a panel.
 *
 * `className` only places it (a dialog pins it to its corner); the look is
 * not the caller's to change. Its name is always given: "Close" says nothing
 * about which of two open things it closes.
 */
export function CloseButton({
  label,
  onClick,
  className,
  disabled,
}: {
  /** what it closes or dismisses, in words: the accessible name */
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
