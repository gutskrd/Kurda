/**
 * Toasts: "Saved", "Couldn't save — …", said once and then gone.
 *
 * They replace the ✅/❌ strings pages printed under their forms (which stayed
 * on screen long after they were true, and were read by nothing) and the
 * browser alerts after a failed click. Two live regions: a polite one for news,
 * an assertive one for failures, so a screen reader is interrupted only when
 * something did not happen. A failure stays twice as long, and every toast can
 * be closed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Layer } from './modal';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast stays: long enough to read twice, a failure longer. */
export const TOAST_MS: Record<ToastTone, number> = { success: 5000, info: 5000, error: 10000 };

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((all) => all.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = next.current++;
      // at most three on screen: the oldest makes way
      setItems((all) => [...all.slice(-2), { id, tone, message }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_MS[tone]));
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => window.clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  const render = (tone: 'polite' | 'assertive'): React.JSX.Element => (
    <div
      className="toast-region"
      role={tone === 'assertive' ? 'alert' : 'status'}
      aria-live={tone}
      aria-atomic="false"
      data-tone={tone}
    >
      {items
        .filter((t) => (t.tone === 'error') === (tone === 'assertive'))
        .map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} />
            <span className="toast-text">{t.message}</span>
            <button type="button" className="icon-button ghost" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* outside the app root, which goes inert while a dialog is open */}
      <Layer>
        <div className="toasts">
          {render('polite')}
          {render('assertive')}
        </div>
      </Layer>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
