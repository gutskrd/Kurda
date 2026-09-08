import { useRef } from 'react';
import { SIZE_RANGE, captureIfPossible, layerBox, type PlacedLayer } from './layers';

/** Corners you can pull. Named by where they sit, so the cursor can match. */
const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;
type Corner = (typeof CORNERS)[number];

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * The selected layer, and the handles for changing it.
 *
 * Until this existed there was no way to tell what was selected except by
 * noticing which panel had appeared underneath, and the only way to resize or
 * turn something was to leave the picture and find a slider. That is the
 * difference between a control panel and an editor: in an editor you work on
 * the thing itself.
 *
 * Laid over the canvas as ordinary elements rather than painted into it, so the
 * outline stays crisp at any canvas resolution and the handles can be real
 * targets with real cursors. The box itself does not take pointer events —
 * dragging inside it falls through to the canvas, which already knows how to
 * move a layer — so only the handles intercept.
 *
 * Everything reports continuously and settles once, so pulling a corner across
 * the picture is a single step in the history rather than a hundred.
 */
export function LayerHandles({
  layer,
  width,
  height,
  onPreview,
  onSettle,
}: {
  layer: PlacedLayer;
  /** the document's own pixel size, which the layer's box is measured against */
  width: number;
  height: number;
  onPreview: (patch: Partial<PlacedLayer>) => void;
  onSettle: () => void;
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  /** what the layer looked like when the current gesture began */
  const gesture = useRef<{ size: number; rotation: number; dist: number; angle: number } | null>(null);

  const box = layerBox(layer, width, height);
  const pct = (n: number): string => `${n * 100}%`;

  /** The layer's centre and the pointer, in the stage's own pixels. */
  function reading(e: React.PointerEvent): { dist: number; angle: number } | null {
    const stage = wrapRef.current?.parentElement;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const cx = r.left + layer.x * r.width;
    const cy = r.top + layer.y * r.height;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return { dist: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
  }

  function begin(e: React.PointerEvent): void {
    const now = reading(e);
    if (!now) return;
    e.stopPropagation();
    e.preventDefault();
    captureIfPossible(e.target as Element, e.pointerId);
    gesture.current = { size: layer.size, rotation: layer.rotation, dist: now.dist, angle: now.angle };
  }

  function end(e: React.PointerEvent): void {
    if (!gesture.current) return;
    e.stopPropagation();
    gesture.current = null;
    onSettle();
  }

  /**
   * Resize by how much further the corner has been pulled from the centre.
   *
   * A ratio rather than a delta, so the same drag does the same thing to a big
   * layer and a small one, and so grabbing any of the four corners behaves
   * identically — which is what you expect when the box is turned and "up" is
   * no longer up.
   */
  function resize(e: React.PointerEvent): void {
    const start = gesture.current;
    const now = start && reading(e);
    if (!start || !now || start.dist <= 0) return;
    e.stopPropagation();
    onPreview({ size: clamp((start.size * now.dist) / start.dist, SIZE_RANGE.min, SIZE_RANGE.max) });
  }

  function rotate(e: React.PointerEvent): void {
    const start = gesture.current;
    const now = start && reading(e);
    if (!start || !now) return;
    e.stopPropagation();
    const turned = start.rotation + (now.angle - start.angle);
    onPreview({ rotation: ((turned % 360) + 360) % 360 });
  }

  return (
    <div
      ref={wrapRef}
      className="layer-box"
      style={{
        left: pct((layer.x * width - box.w / 2) / width),
        top: pct((layer.y * height - box.h / 2) / height),
        width: pct(box.w / width),
        height: pct(box.h / height),
        transform: `rotate(${layer.rotation}deg)`,
      }}
      aria-hidden
    >
      {CORNERS.map((corner: Corner) => (
        <span
          key={corner}
          className={`layer-handle layer-handle-${corner}`}
          onPointerDown={begin}
          onPointerMove={resize}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ))}
      <span
        className="layer-handle layer-handle-turn"
        onPointerDown={begin}
        onPointerMove={rotate}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {/* the stem, so the turn handle reads as attached rather than as a dot */}
      <span className="layer-turn-stem" />
    </div>
  );
}

