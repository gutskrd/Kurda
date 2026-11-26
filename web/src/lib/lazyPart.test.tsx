import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { lazyPart, preloadParts } from './lazyPart';

describe('lazyPart', () => {
  it('fetches a part once, however often it is preloaded and drawn', async () => {
    const load = vi.fn(async () => ({ who }: { who: string }) => <p>hello {who}</p>);
    const Part = lazyPart(load);
    Part.preload();
    Part.preload();
    preloadParts();
    render(
      <Suspense fallback={<p>waiting</p>}>
        <Part who="Rojda" />
      </Suspense>,
    );
    expect(await screen.findByText('hello Rojda')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed fetch', async () => {
    let calls = 0;
    const load = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return () => <p>here now</p>;
    });
    const Part = lazyPart(load);
    Part.preload();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    render(
      <Suspense fallback={null}>
        <Part />
      </Suspense>,
    );
    expect(await screen.findByText('here now')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
