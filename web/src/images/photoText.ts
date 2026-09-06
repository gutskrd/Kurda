/**
 * Burning words into a picture.
 *
 * The text is drawn onto a canvas and the canvas is what gets uploaded, so what
 * the composer shows and what everyone else sees are the same pixels — there is
 * no second renderer to disagree with the preview. The MyKurda mark is added by
 * the server on the way in; the preview draws a stand-in so the corner is not a
 * surprise, but the real one is not the client's to apply.
 */

/** The faces on offer, as CSS stacks that need no web font to download. */
export const FONTS = [
  { key: 'sans', label: 'Sans', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { key: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
  { key: 'slab', label: 'Slab', stack: '"Rockwell", "Courier Bold", Georgia, serif' },
  { key: 'mono', label: 'Mono', stack: '"SF Mono", "Consolas", "Courier New", monospace' },
  { key: 'hand', label: 'Hand', stack: '"Segoe Script", "Bradley Hand", cursive' },
] as const;

export type FontKey = (typeof FONTS)[number]['key'];

export function fontStack(key: FontKey): string {
  return (FONTS.find((f) => f.key === key) ?? FONTS[0]).stack;
}

export interface TextLayer {
  value: string;
  font: FontKey;
  /** as a share of the picture's shorter edge, so it scales with the photo */
  size: number;
  color: string;
  /** degrees, -45 to 45 */
  rotation: number;
  /** 0–1 of the width and height, the centre of the text block */
  x: number;
  y: number;
  /** a dark backing behind the words, for busy photographs */
  plate: boolean;
}

export const DEFAULT_TEXT: TextLayer = {
  value: '',
  font: 'sans',
  size: 0.09,
  color: '#ffffff',
  rotation: 0,
  x: 0.5,
  y: 0.82,
  plate: true,
};

export const SIZE_RANGE = { min: 0.04, max: 0.22 } as const;
export const ROTATION_RANGE = { min: -45, max: 45 } as const;

/** Keep a layer inside the bounds the controls advertise. */
export function clampText(text: TextLayer): TextLayer {
  return {
    ...text,
    size: Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, text.size)),
    rotation: Math.min(ROTATION_RANGE.max, Math.max(ROTATION_RANGE.min, text.rotation)),
    x: Math.min(1, Math.max(0, text.x)),
    y: Math.min(1, Math.max(0, text.y)),
  };
}

/**
 * Split on the author's own line breaks, and wrap anything still too wide.
 *
 * Someone writing a couplet expects their line break kept; someone pasting a
 * sentence expects it not to run off the edge. Both, in that order.
 */
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

/**
 * Draw the picture, then the words, at the picture's own resolution.
 *
 * Everything is measured against the shorter edge so a layout composed on a
 * phone lands the same way on the stored file, whatever its size.
 */
export function drawComposition(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  width: number,
  height: number,
  text: TextLayer | null,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if (!text || text.value.trim().length === 0) return;

  const t = clampText(text);
  const shortEdge = Math.min(width, height);
  const fontPx = Math.round(shortEdge * t.size);
  const lineHeight = Math.round(fontPx * 1.22);
  const pad = Math.round(fontPx * 0.34);

  ctx.font = `600 ${fontPx}px ${fontStack(t.font)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = layoutLines(ctx, t.value, width * 0.86);
  const blockWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const blockHeight = lines.length * lineHeight;

  ctx.save();
  ctx.translate(width * t.x, height * t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);

  if (t.plate) {
    ctx.fillStyle = 'rgba(8, 10, 14, 0.42)';
    const r = Math.round(fontPx * 0.28);
    roundRect(ctx, -blockWidth / 2 - pad, -blockHeight / 2 - pad * 0.7, blockWidth + pad * 2, blockHeight + pad * 1.4, r);
    ctx.fill();
  }

  // a soft shadow so light text survives a bright photo even without the plate
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.round(fontPx * 0.18);
  ctx.fillStyle = t.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight);
  });

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * The longest edge the composition is drawn at.
 *
 * The server resizes to 1280px anyway, so composing larger only makes a bigger
 * file for it to throw away — and a full-resolution export is what put a phone
 * photo over the 5 MB upload cap.
 */
export const MAX_EDGE = 1280;

/** Stay comfortably under the server's upload ceiling. */
const BUDGET_BYTES = 4 * 1024 * 1024;

/** Tried in order: the first that both encodes and fits wins. */
const ENCODINGS: ReadonlyArray<{ type: string; quality: number }> = [
  { type: 'image/webp', quality: 0.9 },
  { type: 'image/webp', quality: 0.75 },
  { type: 'image/jpeg', quality: 0.88 },
  { type: 'image/jpeg', quality: 0.7 },
  { type: 'image/png', quality: 1 },
];

/** Fit a picture inside a box without ever enlarging it. */
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
 * The composed picture as a file, ready to upload.
 *
 * WebP first because it keeps transparency and is by far the smallest; JPEG
 * next for anything that cannot encode it; PNG last, because a lossless export
 * of a photograph is what broke uploads in the first place. A browser that
 * cannot produce the type asked for silently hands back a PNG, so each result
 * is checked rather than trusted.
 */
export async function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  let fallback: File | null = null;

  for (const { type, quality } of ENCODINGS) {
    const blob = await toBlob(canvas, type, quality);
    if (!blob) continue;
    const file = new File([blob], nameFor(name, blob.type), { type: blob.type });
    if (blob.type === type && blob.size <= BUDGET_BYTES) return file;
    // keep the smallest thing that did encode, in case nothing fits
    if (!fallback || file.size < fallback.size) fallback = file;
  }
  return fallback;
}

/**
 * Give the file an extension that matches what it actually is.
 *
 * `base` is a bare stem, not a filename — the encoder decides the format, so
 * the caller has no business claiming one.
 */
function nameFor(base: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : 'png';
  return `${base}.${ext}`;
}
