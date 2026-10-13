/**
 * Render for the admin's Testing Library tests: mount into the document with
 * the admin's own React, inside the providers every page has (toasts and
 * dialogs), and unmount after each test (setup.ts).
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DialogProvider } from '../ui/Dialog';
import { ToastProvider } from '../ui/Toast';

const mounted = new Set<{ root: Root; container: HTMLElement }>();

export interface Rendered {
  container: HTMLElement;
  rerender: (ui: ReactNode) => void;
  unmount: () => void;
}

export function withKit(ui: ReactNode): React.JSX.Element {
  return (
    <ToastProvider>
      <DialogProvider>{ui}</DialogProvider>
    </ToastProvider>
  );
}

/** Mount `ui` as the app would: inside #root, with the kit's providers. */
export function renderUi(ui: ReactNode, { kit = true }: { kit?: boolean } = {}): Rendered {
  const container = document.createElement('div');
  // the app's root: an open layer makes it inert behind itself
  if (!document.getElementById('root')) container.id = 'root';
  document.body.appendChild(container);
  const root = createRoot(container);
  const entry = { root, container };
  mounted.add(entry);
  const wrap = (node: ReactNode): ReactNode => (kit ? withKit(node) : node);
  act(() => root.render(wrap(ui)));
  return {
    container,
    rerender: (next) => act(() => root.render(wrap(next))),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      mounted.delete(entry);
    },
  };
}

export function cleanupRendered(): void {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted.clear();
  if (typeof document !== 'undefined') document.body.classList.remove('has-layer');
}
