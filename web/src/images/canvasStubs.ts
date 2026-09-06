import { vi } from 'vitest';

/**
 * jsdom has no canvas and never fires `load` on an object URL, so a component
 * that draws a picture cannot be exercised without these.
 *
 * They are deliberately thin: enough for the composer to measure, draw and hand
 * back a file, and no more. Testing what the canvas *paints* belongs to
 * `photoText`, which is pure and does not need any of this.
 */
export function stubCanvas(): { calls: string[] } {
  const calls: string[] = [];

  const ctx = {
    canvas: null as unknown,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    shadowColor: '',
    shadowBlur: 0,
    clearRect: () => calls.push('clearRect'),
    lineTo: () => calls.push('lineTo'),
    stroke: () => calls.push('stroke'),
    drawImage: () => calls.push('drawImage'),
    fillText: (t: string) => calls.push(`fillText:${t}`),
    fill: () => calls.push('fill'),
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: () => calls.push('translate'),
    rotate: (r: number) => calls.push(`rotate:${r.toFixed(3)}`),
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    arcTo: () => undefined,
    // a width proportional to the string, so wrapping has something to measure
    measureText: (t: string) => ({ width: t.length * 10 }),
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
    cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  });

  return { calls };
}

/**
 * An Image that resolves immediately, at a size the caller can rely on.
 *
 * `fail` makes it refuse to decode, which is the only honest way to test a file
 * that is not a picture — the component deliberately no longer judges by the
 * file's declared type.
 */
export function stubImage(opts: { width?: number; height?: number; fail?: boolean } = {}): void {
  const { width = 900, height = 700, fail = false } = opts;

  /*
   * Object URLs are tracked, and a revoked one refuses to load — which is what a
   * browser does, and what a constant URL with a no-op revoke could never show.
   * React runs an effect twice in development: mount, clean up, mount. The
   * cleanup revokes the first run's URL while its image is still loading, so
   * that image fails; treating that failure as a bad file is a bug this stub
   * exists to catch.
   */
  let issued = 0;
  const live = new Set<string>();

  class LoadedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    #src = '';
    set src(value: string) {
      this.#src = value;
      // a microtask, so the component's effect has finished before it lands
      // revocation only applies to object URLs; an ordinary path (a sticker
      // under /stickers, say) is not something createObjectURL ever issued
      const revoked = value.startsWith('blob:') && !live.has(value);
      queueMicrotask(() => (fail || revoked ? this.onerror?.() : this.onload?.()));
    }
    get src(): string {
      return this.#src;
    }
  }
  vi.stubGlobal('Image', LoadedImage);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      const url = `blob:preview-${++issued}`;
      live.add(url);
      return url;
    },
    revokeObjectURL: (url: string) => live.delete(url),
  });
}
