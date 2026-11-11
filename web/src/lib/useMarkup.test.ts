import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMarkup } from './useMarkup';

describe('useMarkup', () => {
  it('hands back the same object while the markup is the same, however often it is asked', () => {
    // the string is put together again on every render, as a caller that draws inline does
    const { result, rerender } = renderHook(({ fill }: { fill: string }) => useMarkup(['<circle r="4" fill="', fill, '"/>'].join('')), { initialProps: { fill: 'red' } });
    const first = result.current;
    expect(first).toEqual({ __html: '<circle r="4" fill="red"/>' });
    rerender({ fill: 'red' });
    expect(result.current).toBe(first);
  });

  it('hands back the new markup as soon as it changes', () => {
    const { result, rerender } = renderHook(({ html }: { html: string }) => useMarkup(html), { initialProps: { html: '<path d="M0 0"/>' } });
    const first = result.current;
    rerender({ html: '<path d="M1 1"/>' });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ __html: '<path d="M1 1"/>' });
  });
});
