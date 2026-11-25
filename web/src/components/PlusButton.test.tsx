import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlusButton } from './PlusButton';

/** The stylesheet, read from disk, since an imported stylesheet arrives empty in tests. */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// beside this file, wherever the suite is run from
const here = import.meta.url;
const ui = readFileSync(new URL('../styles/ui.css', here), 'utf8');

function offer(onJoin = vi.fn(), onDecline = vi.fn()) {
  render(<PlusButton label="Join Hevalo+" value="Double Zêr and a box each month." decline={{ label: 'Not now', onPress: onDecline }} onJoin={onJoin} />);
  return { onJoin, onDecline };
}

describe('Hevalo+’s button', () => {
  it('joins, with what membership gives written under it', () => {
    const { onJoin } = offer();
    fireEvent.click(screen.getByRole('button', { name: 'Join Hevalo+' }));
    expect(onJoin).toHaveBeenCalledOnce();
    expect(screen.getByText('Double Zêr and a box each month.')).toBeTruthy();
  });

  it('always shows a plain way to say no beside it', () => {
    const { onJoin, onDecline } = offer();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('wears its own gold, taller than the main button, and shines once and not under Reduce Motion', () => {
    offer();
    expect(screen.getByRole('button', { name: 'Join Hevalo+' }).className).toContain('btn-plus');
    const button = /\.btn-plus \{([^}]*)\}/.exec(ui)![1]!;
    expect(button).toContain('background: var(--plus-fill)');
    expect(Number(/height: (\d+)px/.exec(button)![1])).toBeGreaterThan(52);
    expect(/\.btn-plus::after \{[^}]*animation: plus-shine [^;]* 1 both;/.test(ui)).toBe(true);
    expect(/@media \(prefers-reduced-motion: reduce\) \{\s*\.btn-plus::after \{\s*animation: none;/.test(ui)).toBe(true);
  });
});
