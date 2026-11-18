import { stickerImage } from './stickers';
import { fontStack, layoutLines, type FontKey } from './photoText';
import { clamp, type CropRect } from './frame';

/**
 * What sits on top of a picture: words, stickers and strokes in one list, since they share position, size and turn and
 * the order added is the stacking order. Everything is a share of the picture, never pixels, so a layout made on a
 * phone lands the same in the stored file.
 */

export interface Common {
  id: string;
  /** 0–1 of width and height: the centre. */
  x: number;
  y: number;
  /** Degrees, 0–360. */
  rotation: number;
}

export interface TextLayerV2 extends Common {
  kind: 'text';
  value: string;
  font: FontKey;
  /** As a share of the shorter edge. */
  size: number;
  color: string;
  plate: boolean;
}

/**
 * A sticker: an emoji `glyph` drawn as text, or a picture `src` under /stickers (which wins). Pictures come from this
 * app's own origin because a cross-origin image taints the canvas, and a tainted canvas cannot be exported.
 */
export interface StickerLayer extends Common {
  kind: 'sticker';
  glyph: string;
  /** Path under /stickers for a picture sticker. */
  src?: string;
  size: number;
}

export interface StrokeLayer {
  kind: 'stroke';
  id: string;
  color: string;
  /** As a share of the shorter edge. */
  width: number;
  /** Points as shares of the picture, so a stroke scales with it. */
  points: Array<{ x: number; y: number }>;
}

export type Layer = TextLayerV2 | StickerLayer | StrokeLayer;

/** A layer that can be moved; strokes stay where they were drawn. */
export type PlacedLayer = TextLayerV2 | StickerLayer;

export function isPlaced(layer: Layer): layer is PlacedLayer {
  return layer.kind !== 'stroke';
}

export const SIZE_RANGE = { min: 0.03, max: 0.3 } as const;
/** A full turn. */
export const ROTATION_RANGE = { min: 0, max: 360 } as const;
export const STROKE_RANGE = { min: 0.004, max: 0.06 } as const;

/**
 * The corner the server's signature mark covers, shaded in the editor so nothing important is placed under it; matches
 * the server: about 5.5% of the shorter edge, inset 2.8%.
 */
const SIGNATURE_ZONE = { heightShare: 0.055, insetShare: 0.028, minHeight: 22, maxHeight: 56 } as const;

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

/** Holds a layer inside what the controls can express. */
export function clampLayer(layer: Layer): Layer {
  if (layer.kind === 'stroke') {
    return { ...layer, width: clamp(layer.width, STROKE_RANGE.min, STROKE_RANGE.max) };
  }
  return {
    ...layer,
    size: clamp(layer.size, SIZE_RANGE.min, SIZE_RANGE.max),
    // A turn wraps: 370° is 10°.
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
    // Not loaded yet: draw nothing this frame. The editor redraws when it arrives, and the export waits for all.
    if (img) {
      // `px` is the longest edge, so tall and wide stickers at one size cover the same area.
      const scale = px / Math.max(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
  } else {
    // A system emoji font, so the glyph is the one the writer picked.
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
  // A single tap is a dot.
  if (rest.length === 0) ctx.lineTo(first!.x * width + 0.01, first!.y * height);
  for (const p of rest) ctx.lineTo(p.x * width, p.y * height);
  ctx.stroke();
  ctx.restore();
}

/** Draws the picture and everything on it. The signature is added last, by the server. */
export function drawLayers(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  width: number,
  height: number,
  layers: readonly Layer[],
  crop?: CropRect,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  // Some engines default to a box filter when scaling.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // One draw path for preview and export, so what is arranged is what is stored.
  if (crop) ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  else ctx.drawImage(image, 0, 0, width, height);

  for (const raw of layers) {
    const layer = clampLayer(raw);
    if (layer.kind === 'text') drawText(ctx, layer, width, height);
    else if (layer.kind === 'sticker') drawSticker(ctx, layer, width, height);
    else drawStroke(ctx, layer, width, height);
  }
}

/**
 * Asks for pointer capture, carrying on without it: capture keeps a drag going off the element, but it throws when the
 * browser has no active pointer with that id, which would abandon the gesture.
 */
export function captureIfPossible(target: Element, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // No active pointer with that id; the gesture still works uncaptured.
  }
}

/* --- keeping things inside the picture ------------------------------------ */

/** A context for measuring text only, made lazily; without one the size is estimated. */
let measurer: CanvasRenderingContext2D | null | undefined;
function measuringContext(): CanvasRenderingContext2D | null {
  if (measurer === undefined) {
    try {
      measurer = document.createElement('canvas').getContext('2d');
    } catch {
      measurer = null;
    }
  }
  return measurer;
}

/** A layer's drawn size in pixels before turning. Mirrors `drawText` and `drawSticker`; keep them in step. */
export function layerBox(layer: PlacedLayer, width: number, height: number): { w: number; h: number } {
  const shortEdge = Math.min(width, height);

  if (layer.kind === 'sticker') {
    const px = Math.round(shortEdge * layer.size);
    const img = layer.src ? stickerImage(layer.src) : null;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      // `px` is the longest edge, so tall and wide stickers at one size cover the same area.
      const scale = px / Math.max(img.naturalWidth, img.naturalHeight);
      return { w: img.naturalWidth * scale, h: img.naturalHeight * scale };
    }
    return { w: px, h: px };
  }

  const fontPx = Math.round(shortEdge * layer.size);
  const lineHeight = Math.round(fontPx * 1.22);
  const pad = Math.round(fontPx * 0.34);
  const ctx = measuringContext();

  let lines: string[];
  let blockWidth: number;
  if (ctx) {
    ctx.font = `600 ${fontPx}px ${fontStack(layer.font)}`;
    lines = layoutLines(ctx, layer.value, width * 0.86);
    blockWidth = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  } else {
    // No canvas to ask: assume an average glyph a little over half the font size.
    lines = layer.value.split('\n');
    blockWidth = Math.min(width * 0.86, Math.max(...lines.map((l) => l.length)) * fontPx * 0.55);
  }

  /* Empty words draw nothing, so a placeholder-sized box shows where they will land until the first letter is typed. */
  if (layer.value.trim().length === 0) blockWidth = width * 0.3;

  const blockHeight = Math.max(1, lines.length) * lineHeight;
  // The plate is the visible edge, so it is what must fit.
  return layer.plate
    ? { w: blockWidth + pad * 2, h: blockHeight + pad * 1.4 }
    : { w: blockWidth, h: blockHeight };
}

/**
 * Holds a layer's box inside the picture, where `clampLayer` only holds its centre and lets half a sticker be cut off
 * on export. A turned box grows by |cos| and |sin| of the angle. Anything bigger than the picture is centred.
 */
export function keepInside(layer: PlacedLayer, width: number, height: number): PlacedLayer {
  if (width <= 0 || height <= 0) return layer;
  const box = layerBox(layer, width, height);
  const radians = (layer.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfW = (box.w / 2) * cos + (box.h / 2) * sin;
  const halfH = (box.w / 2) * sin + (box.h / 2) * cos;

  const marginX = halfW / width;
  const marginY = halfH / height;
  const x = marginX * 2 >= 1 ? 0.5 : clamp(layer.x, marginX, 1 - marginX);
  const y = marginY * 2 >= 1 ? 0.5 : clamp(layer.y, marginY, 1 - marginY);
  return x === layer.x && y === layer.y ? layer : { ...layer, x, y };
}
