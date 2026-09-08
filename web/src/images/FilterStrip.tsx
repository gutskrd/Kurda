import { useEffect, useRef } from 'react';
import { FILTERS, gradeOf } from './filters';
import { applyGrade, drawOverlay, gradeDoesNothing } from './composition';
import { NEUTRAL } from './adjust';
import type { CropRect } from './frame';

/** Drawn size of one thumbnail, in CSS pixels. */
const THUMB = 62;

/**
 * The filters, each shown on the actual photograph.
 *
 * A row of names would make you try all ten to find out what they do. Showing
 * them on the picture in front of you is the whole reason this pattern exists,
 * and it is cheap here: ten thumbnails at 62px is about forty thousand pixels
 * altogether, less than a tenth of one preview frame.
 *
 * The thumbnails follow the crop rather than the whole picture, so what they
 * preview is what is actually going to be posted.
 */
export function FilterStrip({
  image,
  crop,
  activeKey,
  artReady,
  onPick,
}: {
  image: CanvasImageSource;
  crop: CropRect;
  activeKey: string;
  /** bumped when overlay artwork decodes, so a thumbnail that needs it redraws */
  artReady: number;
  onPick: (key: string) => void;
}): React.JSX.Element {
  // the middle square of the crop, so every thumbnail is the same shape
  const side = Math.min(crop.sw, crop.sh);
  const sx = crop.sx + (crop.sw - side) / 2;
  const sy = crop.sy + (crop.sh - side) / 2;

  return (
    <div className="filter-strip" role="radiogroup" aria-label="Filter">
      {FILTERS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          role="radio"
          aria-checked={activeKey === preset.key}
          className={`filter-thumb${activeKey === preset.key ? ' is-on' : ''}`}
          title={preset.hint}
          onClick={() => onPick(preset.key)}
        >
          <Thumb image={image} sx={sx} sy={sy} side={side} filterKey={preset.key} artReady={artReady} />
          <span className="filter-thumb-label">{preset.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * One filter, on this picture.
 *
 * Deliberately does not go through `compose`: that keeps a single cached graded
 * canvas for the live preview, and ten thumbnails asking it for ten different
 * gradings would evict that entry ten times per redraw.
 */
function Thumb({
  image,
  sx,
  sy,
  side,
  filterKey,
  artReady,
}: {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  side: number;
  filterKey: string;
  artReady: number;
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || side <= 0) return;
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    const px = Math.round(THUMB * dpr);
    canvas.width = px;
    canvas.height = px;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, side, side, 0, 0, px, px);

    // the same grade the live preview and the export will use, at full
    // strength: a thumbnail is what the filter does, not what it is doing now
    const grade = gradeOf(filterKey, 1, NEUTRAL);
    if (gradeDoesNothing(grade)) return;
    try {
      const pixels = ctx.getImageData(0, 0, px, px);
      applyGrade(pixels.data, px, px, grade);
      ctx.putImageData(pixels, 0, 0);
      if (grade.overlay) drawOverlay(ctx, px, px, grade.overlay);
    } catch {
      // a tainted canvas refuses a read-back; an ungraded thumbnail is a fine
      // outcome for something that is only a hint at what the filter does
    }
  }, [image, sx, sy, side, filterKey, artReady]);

  return <canvas ref={ref} className="filter-thumb-canvas" aria-hidden />;
}
