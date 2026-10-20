/**
 * Dialogs: the one place the admin asks "are you sure?".
 *
 * They replace the browser's alert, confirm and prompt, which every page used.
 * Those cannot say which button is the dangerous one, cannot ask for a typed
 * confirmation, block the whole tab (and every timer in it), look different in
 * every browser and are suppressed outright by some — a "Remove" that silently
 * did nothing on a phone that had blocked them.
 *
 * `useDialogs()` keeps call sites as short as the old ones:
 *
 *   if (!(await dialogs.confirm({ title: 'Remove “heval”?', confirmLabel: 'Remove', tone: 'danger' }))) return;
 *   const name = await dialogs.prompt({ title: 'Rename', label: 'New name', initial: word });
 */
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Layer, useModal } from './modal';
import { Icon } from './icons';

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** a dangerous choice: the scrim does not close it, so a stray tap cannot answer it either */
  dismissable?: boolean;
  size?: 'small' | 'medium' | 'large';
  /** for role="alertdialog": something the person must answer, not just read */
  alert?: boolean;
}

export function Dialog({ open, title, onClose, children, footer, dismissable = true, size = 'small', alert = false }: DialogProps): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useModal(ref, open, onClose);
  if (!open) return null;
  return (
    <Layer>
      <div className="layer-scrim" onClick={dismissable ? onClose : undefined} aria-hidden="true" />
      <div
        ref={ref}
        className={`dialog dialog-${size}`}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <button type="button" className="icon-button ghost" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <Icon name="close" />
          </button>
        </div>
        {children && (
          <div id={bodyId} className="dialog-body">
            {children}
          </div>
        )}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </Layer>
  );
}

export interface ConfirmOptions {
  title: ReactNode;
  /** what will happen, in plain words */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /**
   * For what cannot be undone: the confirm button stays off until this exact
   * text is typed (a username, a key) — a deliberate act, not a reflex click.
   */
  typed?: { phrase: string; label?: string };
}

export function ConfirmDialog({
  open,
  options,
  onAnswer,
}: {
  open: boolean;
  options: ConfirmOptions;
  onAnswer: (yes: boolean) => void;
}): React.JSX.Element | null {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const { title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default' } = options;
  const phrase = options.typed?.phrase;
  const ready = !phrase || typed.trim() === phrase;
  const answer = (yes: boolean): void => {
    setTyped('');
    onAnswer(yes);
  };
  return (
    <Dialog
      open={open}
      title={title}
      onClose={() => answer(false)}
      dismissable={tone !== 'danger'}
      alert
      footer={
        <>
          <button type="button" onClick={() => answer(false)} data-autofocus={tone === 'danger' && !phrase ? true : undefined}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'danger-solid' : 'primary'}
            onClick={() => answer(true)}
            disabled={!ready}
            data-autofocus={tone !== 'danger' && !phrase ? true : undefined}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {typeof body === 'string' ? <p className="dialog-text">{body}</p> : body}
      {phrase && (
        <div className="field">
          <label htmlFor={inputId}>{options.typed?.label ?? <>Type <strong className="mono">{phrase}</strong> to confirm</>}</label>
          <input
            id={inputId}
            data-autofocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) answer(true);
            }}
          />
        </div>
      )}
    </Dialog>
  );
}

export interface PromptOptions {
  title: ReactNode;
  label: string;
  body?: ReactNode;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** a problem with the value, or null when it can be sent */
  validate?: (value: string) => string | null;
  multiline?: boolean;
  maxLength?: number;
  /**
   * A dangerous change asked with a reason (voiding a game, resetting a
   * rating): the confirm button is the red one, and a stray tap on the scrim
   * cannot close it and lose what was typed.
   */
  tone?: 'default' | 'danger';
}

function PromptDialog({
  open,
  options,
  onAnswer,
}: {
  open: boolean;
  options: PromptOptions;
  onAnswer: (value: string | null) => void;
}): React.JSX.Element | null {
  const [value, setValue] = useState(options.initial ?? '');
  const [touched, setTouched] = useState(false);
  const id = useId();
  // a page's own check replaces the default one (a note may be emptied to clear it)
  const problem = options.validate ? options.validate(value) : value.trim() ? null : 'This can’t be empty.';
  const danger = options.tone === 'danger';
  const send = (): void => {
    setTouched(true);
    if (!problem) onAnswer(value.trim());
  };
  return (
    <Dialog
      open={open}
      title={options.title}
      onClose={() => onAnswer(null)}
      dismissable={!danger}
      alert={danger}
      footer={
        <>
          <button type="button" onClick={() => onAnswer(null)}>
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} className={danger ? 'danger-solid' : 'primary'}>
            {options.confirmLabel ?? 'Save'}
          </button>
        </>
      }
    >
      {typeof options.body === 'string' ? <p className="dialog-text">{options.body}</p> : options.body}
      <form
        id={`${id}-form`}
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={id}>{options.label}</label>
        {options.multiline ? (
          <textarea
            id={id}
            data-autofocus
            rows={4}
            value={value}
            maxLength={options.maxLength}
            placeholder={options.placeholder}
            aria-invalid={touched && !!problem}
            aria-describedby={touched && problem ? `${id}-err` : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <input
            id={id}
            data-autofocus
            value={value}
            maxLength={options.maxLength}
            placeholder={options.placeholder}
            aria-invalid={touched && !!problem}
            aria-describedby={touched && problem ? `${id}-err` : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        {touched && problem && (
          <div id={`${id}-err`} className="field-error">
            {problem}
          </div>
        )}
      </form>
    </Dialog>
  );
}

interface Dialogs {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (yes: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

const DialogContext = createContext<Dialogs | null>(null);

/** One dialog at a time for the whole admin; a second question waits for the first answer. */
export function DialogProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [queue, setQueue] = useState<Pending[]>([]);
  // a key per question, so a prompt's field starts empty for the next one
  const seq = useRef(0);
  const [keys, setKeys] = useState<number[]>([]);

  const push = useCallback((p: Pending) => {
    seq.current += 1;
    const key = seq.current;
    setQueue((q) => [...q, p]);
    setKeys((k) => [...k, key]);
  }, []);

  const dialogs = useMemo<Dialogs>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => push({ kind: 'confirm', options, resolve })),
      prompt: (options) => new Promise<string | null>((resolve) => push({ kind: 'prompt', options, resolve })),
    }),
    [push],
  );

  const current = queue[0];
  const done = (): void => {
    setQueue((q) => q.slice(1));
    setKeys((k) => k.slice(1));
  };

  return (
    <DialogContext.Provider value={dialogs}>
      {children}
      {current?.kind === 'confirm' && (
        <ConfirmDialog
          key={keys[0]}
          open
          options={current.options}
          onAnswer={(yes) => {
            done();
            current.resolve(yes);
          }}
        />
      )}
      {current?.kind === 'prompt' && (
        <PromptDialog
          key={keys[0]}
          open
          options={current.options}
          onAnswer={(value) => {
            done();
            current.resolve(value);
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialogs(): Dialogs {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside DialogProvider');
  return ctx;
}
