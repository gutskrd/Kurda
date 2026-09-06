import { stickerImage } from './stickers';
import { fontStack, layoutLines, type FontKey } from './photoText';

/**
 * What sits on top of a picture.
 *
 * Words, stickers and drawn strokes are one list rather than three, because
 * they share almost everything — a position, a size, a turn — and because the
 * order they were added in is the order they stack. Three parallel lists would
 * mean inventing a rule for how they interleave.
 *
 * Everything is measured as a share of the picture, never in pixels: a layout
 * arranged on a phone has to land in the same place in the stored file, and the
 * two are different sizes.
 */

export interface Common {
  id: string;
  /** 0–1 of width and height: the centre of the thing */
  x: number;
  y: number;
  /** degrees, 0–360 — a full turn, not a lean */
  rotation: number;
}

export interface TextLayerV2 extends Common {
  kind: 'text';
  value: string;
  font: FontKey;
  /** as a share of the shorter edge */
  size: number;
  color: string;
  plate: boolean;
}

/**
 * A sticker: either a character or a picture.
 *
 * `glyph` is an emoji, drawn as text in the system emoji font. `src` is a file
 * under /stickers, drawn as an image. One of the two is set — a sticker with a
 * `src` ignores its glyph — and they share everything else, so placing, turning
 * and resizing needed no second implementation.
 *
 * The pictures are served from this app's own origin on purpose: drawing a
 * cross-origin image onto a canvas taints it, and a tainted canvas cannot be
 * exported at all, which would break posting rather than just the sticker.
 */
export interface StickerLayer extends Common {
  kind: 'sticker';
  glyph: string;
  /** path under /stickers when this is a picture rather than a character */
  src?: string;
  size: number;
}

export interface StrokeLayer {
  kind: 'stroke';
  id: string;
  color: string;
  /** as a share of the shorter edge */
  width: number;
  /** points as shares of the picture, so a stroke scales with it */
  points: Array<{ x: number; y: number }>;
}

export type Layer = TextLayerV2 | StickerLayer | StrokeLayer;

/**
 * A layer you can pick up and move.
 *
 * A stroke is drawn where it was drawn — it has no centre to drag and no size
 * to turn — so the two are kept apart rather than every control checking.
 */
export type PlacedLayer = TextLayerV2 | StickerLayer;

export function isPlaced(layer: Layer): layer is PlacedLayer {
  return layer.kind !== 'stroke';
}

export const SIZE_RANGE = { min: 0.03, max: 0.3 } as const;
/** A full turn. Half a turn each way was a lean, not a rotation. */
export const ROTATION_RANGE = { min: 0, max: 360 } as const;
export const STROKE_RANGE = { min: 0.004, max: 0.06 } as const;

/**
 * The corner the signature owns.
 *
 * Nothing is drawn over it — the mark goes on last — but the editor shades it
 * so nobody arranges something important underneath and wonders where it went.
 * Matches the server's placement: about 5.5% of the shorter edge, inset 2.8%.
 */
export const SIGNATURE_ZONE = { heightShare: 0.055, insetShare: 0.028, minHeight: 22, maxHeight: 56 } as const;

export function signatureBox(width: number, height: number, handle: string): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const shortEdge = Math.min(width, height);
  const h = Math.round(
    Math.min(SIGNATURE_ZONE.maxHeight, Math.max(SIGNATURE_ZONE.minHeight, shortEdge * SIGNATURE_ZONE.heightShare)),
  );
  const pad = Math.round(h * 0.34);
  const glyph = Math.round(h * 0.62);
  const font = Math.round(h * 0.46);
  const text = Math.ceil((handle.length + 1) * font * 0.62);
  const w = pad + glyph + Math.round(pad * 0.5) + text + pad;
  const inset = Math.round(shortEdge * SIGNATURE_ZONE.insetShare);
  return { x: Math.max(0, width - w - inset), y: Math.max(0, height - h - inset), w, h };
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `l${counter}`;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Hold a layer inside what the controls can express. */
export function clampLayer(layer: Layer): Layer {
  if (layer.kind === 'stroke') {
    return { ...layer, width: clamp(layer.width, STROKE_RANGE.min, STROKE_RANGE.max) };
  }
  return {
    ...layer,
    size: clamp(layer.size, SIZE_RANGE.min, SIZE_RANGE.max),
    // a turn wraps: 370° is 10°, and dragging past the end should keep going
    rotation: ((layer.rotation % 360) + 360) % 360,
    x: clamp(layer.x, 0, 1),
    y: clamp(layer.y, 0, 1),
  };
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

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayerV2, width: number, height: number): void {
  if (layer.value.trim().length === 0) return;
  const shortEdge = Math.min(width, height);
  const fontPx = Math.round(shortEdge * layer.size);
  const lineHeight = Math.round(fontPx * 1.22);
  const pad = Math.round(fontPx * 0.34);

  ctx.font = `600 ${fontPx}px ${fontStack(layer.font)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = layoutLines(ctx, layer.value, width * 0.86);
  const blockWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const blockHeight = lines.length * lineHeight;

  ctx.save();
  ctx.translate(width * layer.x, height * layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);

  if (layer.plate) {
    ctx.fillStyle = 'rgba(8, 10, 14, 0.42)';
    roundRect(
      ctx,
      -blockWidth / 2 - pad,
      -blockHeight / 2 - pad * 0.7,
      blockWidth + pad * 2,
      blockHeight + pad * 1.4,
      Math.round(fontPx * 0.28),
    );
    ctx.fill();
  }

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.round(fontPx * 0.18);
  ctx.fillStyle = layer.color;
  lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight));
  ctx.restore();
}

function drawSticker(ctx: CanvasRenderingContext2D, layer: StickerLayer, width: number, height: number): void {
  const px = Math.round(Math.min(width, height) * layer.size);
  ctx.save();
  ctx.translate(width * layer.x, height * layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);

  if (layer.src) {
    const img = stickerImage(layer.src);
    // not loaded yet: draw nothing this frame rather than a broken box. The
    // editor redraws when it arrives, and the export waits for all of them.
    if (img) {
      // `px` is the longest edge, so a tall sticker and a wide one at the same
      // size setting take up the same amount of picture
      const scale = px / Math.max(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
  } else {
    // a system emoji font, so the glyph is the one the writer picked
    ctx.font = `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layer.glyph, 0, 0);
  }
  ctx.restore();
}

function drawStroke(ctx: CanvasRenderingContext2D, layer: StrokeLayer, width: number, height: number): void {
  if (layer.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * layer.width));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const [first, ...rest] = layer.points;
  ctx.moveTo(first!.x * width, first!.y * height);
  // a single tap is a dot, not nothing
  if (rest.length === 0) ctx.lineTo(first!.x * width + 0.01, first!.y * height);
  for (const p of rest) ctx.lineTo(p.x * width, p.y * height);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the picture and everything on it.
 *
 * The signature is not here: it goes on last, and on the server, so that
 * nothing a person adds can end up over the top of it.
 */
export function drawLayers(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  width: number,
  height: number,
  layers: readonly Layer[],
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  for (const raw of layers) {
    const layer = clampLayer(raw);
    if (layer.kind === 'text') drawText(ctx, layer, width, height);
    else if (layer.kind === 'sticker') drawSticker(ctx, layer, width, height);
    else drawStroke(ctx, layer, width, height);
  }
}
