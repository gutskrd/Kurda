/**
 * A panel that slides over the page: the phone's menu from the side, a detail
 * or a form from the other side — which on a phone rises from the bottom as a
 * sheet, where a thumb reaches it. Same keyboard and focus rules as a dialog
 * (modal.tsx).
 */
import { useId, useRef, type ReactNode } from 'react';
import { Layer, useModal } from './modal';
import { Icon } from './icons';

export function Drawer({
  open,
  onClose,
  title,
  side = 'end',
  children,
  footer,
  className,
  id,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** start: the menu's side; end: details and forms (a bottom sheet on a phone) */
  side?: 'start' | 'end';
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** for the button that opens it to name it (aria-controls) */
  id?: string;
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(ref, open, onClose);
  if (!open) return null;
  return (
    <Layer>
      <div className="layer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        id={id}
        className={`drawer drawer-${side}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="drawer-head">
          <h2 id={titleId} className="drawer-title">
            {title}
          </h2>
          <button type="button" className="icon-button ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </Layer>
  );
}
