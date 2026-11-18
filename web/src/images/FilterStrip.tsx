import { useEffect, useRef } from 'react';
import { FILTERS, gradeOf } from './filters';
import { applyGrade, drawOverlay, gradeDoesNothing } from './composition';
import { NEUTRAL } from './adjust';
import type { CropRect } from './frame';
import { useT } from '../i18n/I18nProvider';

/** Drawn size of one thumbnail, in CSS pixels. */
const THUMB = 62;

/**
 * The filters, each previewed on the actual crop; ten 62px thumbnails cost less than a tenth of one preview frame.
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
  /** Bumped when overlay artwork decodes, so a thumbnail that needs it redraws. */
  artReady: number;
  onPick: (key: string) => void;
}): React.JSX.Element {
  const t = useT();
  // The crop's middle square, so every thumbnail is the same shape.
  const side = Math.min(crop.sw, crop.sh);
  const sx = crop.sx + (crop.sw - side) / 2;
  const sy = crop.sy + (crop.sh - side) / 2;

  return (
    <div className="filter-strip" role="radiogroup" aria-label={t('photo.tab.filter')}>
      {FILTERS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          role="radio"
          aria-checked={activeKey === preset.key}
          className={`filter-thumb${activeKey === preset.key ? ' is-on' : ''}`}
          title={t(preset.hintKey)}
          onClick={() => onPick(preset.key)}
        >
          <Thumb image={image} sx={sx} sy={sy} side={side} filterKey={preset.key} artReady={artReady} />
          <span className="filter-thumb-label">{preset.label}</span>
        </button>
      ))}
    </div>
  );
}

/** One filter on this picture, bypassing `compose` so the thumbnails do not evict the preview's cached grade. */
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

    // The same grade as preview and export, at full strength: what the filter does.
    const grade = gradeOf(filterKey, 1, NEUTRAL);
    if (gradeDoesNothing(grade)) return;
    try {
      const pixels = ctx.getImageData(0, 0, px, px);
      applyGrade(pixels.data, px, px, grade);
      ctx.putImageData(pixels, 0, 0);
      if (grade.overlay) drawOverlay(ctx, px, px, grade.overlay);
    } catch {
      // A tainted canvas refuses a read-back; an ungraded thumbnail is fine for a hint.
    }
  }, [image, sx, sy, side, filterKey, artReady]);

  return <canvas ref={ref} className="filter-thumb-canvas" aria-hidden />;
}
