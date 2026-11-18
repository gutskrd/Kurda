import { vi } from 'vitest';

/** Canvas and image stubs for tests: jsdom has no canvas and never fires `load` on an object URL. */
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
    // A width proportional to the string, so wrapping has something to measure.
    measureText: (t: string) => ({ width: t.length * 10 }),
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
    cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  });

  return { calls };
}

/** An Image that loads immediately at a given size; `fail` makes it refuse to decode, to test a file that is not a picture. */
export function stubImage(opts: { width?: number; height?: number; fail?: boolean } = {}): void {
  const { width = 900, height = 700, fail = false } = opts;

  /*
   * Object URLs are tracked and a revoked one fails to load, as in a browser. Development mode runs an effect twice, and
   * treating the first run's revoked image as a bad file is the bug this catches.
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
      // A microtask, so the component's effect has finished first. Only object URLs can be revoked; a plain path like a
      // sticker's never is.
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
