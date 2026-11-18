import type { MessageKey } from '../i18n/en';

/** Text and export helpers for the photo editor: the fonts, line wrapping, fitting a picture and encoding the upload. */

/** The faces on offer, as CSS stacks that need no web font to download. */
export const FONTS = [
  { key: 'sans', labelKey: 'photo.font.sans' as MessageKey, stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { key: 'serif', labelKey: 'photo.font.serif' as MessageKey, stack: 'Georgia, "Times New Roman", serif' },
  { key: 'slab', labelKey: 'photo.font.slab' as MessageKey, stack: '"Rockwell", "Courier Bold", Georgia, serif' },
  { key: 'mono', labelKey: 'photo.font.mono' as MessageKey, stack: '"SF Mono", "Consolas", "Courier New", monospace' },
  { key: 'hand', labelKey: 'photo.font.hand' as MessageKey, stack: '"Segoe Script", "Bradley Hand", cursive' },
] as const;

export type FontKey = (typeof FONTS)[number]['key'];

export function fontStack(key: FontKey): string {
  return (FONTS.find((f) => f.key === key) ?? FONTS[0]).stack;
}

/** Splits on the author's own line breaks, then wraps anything still too wide. */
export function layoutLines(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of value.split('\n')) {
    const words = paragraph.split(' ').filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = words[0]!;
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** The longest edge composed: the server resizes to 1280px anyway, and full resolution exceeded the 5 MB upload cap. */
export const MAX_EDGE = 1280;

/** Comfortably under the server's upload ceiling. */
const BUDGET_BYTES = 4 * 1024 * 1024;

/** Tried in order: the first that both encodes and fits wins. */
const ENCODINGS: ReadonlyArray<{ type: string; quality: number }> = [
  { type: 'image/webp', quality: 0.9 },
  { type: 'image/webp', quality: 0.75 },
  { type: 'image/jpeg', quality: 0.88 },
  { type: 'image/jpeg', quality: 0.7 },
  { type: 'image/png', quality: 1 },
];

/** Fits a picture inside a box without enlarging it. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The composed picture as a file to upload: WebP first (transparency, smallest), then JPEG, then PNG. A browser that
 * cannot encode a type silently returns PNG, so each result is checked.
 */
export async function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  let fallback: File | null = null;

  for (const { type, quality } of ENCODINGS) {
    const blob = await toBlob(canvas, type, quality);
    if (!blob) continue;
    const file = new File([blob], nameFor(name, blob.type), { type: blob.type });
    if (blob.type === type && blob.size <= BUDGET_BYTES) return file;
    // Keep the smallest file that encoded, in case nothing fits.
    if (!fallback || file.size < fallback.size) fallback = file;
  }
  return fallback;
}

/** Names the file for what the encoder produced; `base` is a bare stem. */
function nameFor(base: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : 'png';
  return `${base}.${ext}`;
}
