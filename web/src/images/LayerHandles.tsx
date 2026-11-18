import { useRef } from 'react';
import { clamp } from './frame';
import { SIZE_RANGE, captureIfPossible, layerBox, type PlacedLayer } from './layers';

/** Pullable corners, named by position so the cursor can match. */
const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;
type Corner = (typeof CORNERS)[number];

/**
 * The selected layer's outline and its resize and turn handles, laid over the canvas as elements so they stay crisp and
 * have real cursors. The box itself passes pointer events through to the canvas, which moves the layer. Gestures
 * preview continuously and settle once, so each is one history step.
 */
export function LayerHandles({
  layer,
  width,
  height,
  onPreview,
  onSettle,
}: {
  layer: PlacedLayer;
  /** The document's pixel size, which the layer's box is measured against. */
  width: number;
  height: number;
  onPreview: (patch: Partial<PlacedLayer>) => void;
  onSettle: () => void;
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  /** The layer as it was when the current gesture began. */
  const gesture = useRef<{ size: number; rotation: number; dist: number; angle: number } | null>(null);

  const box = layerBox(layer, width, height);
  const pct = (n: number): string => `${n * 100}%`;

  /** The distance and angle from the layer's centre to the pointer, in the stage's pixels. */
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

  /** Resizes by the ratio of the corner's distance from the centre, so any corner works the same at any size and turn. */
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
      {/* The stem, so the turn handle reads as attached. */}
      <span className="layer-turn-stem" />
    </div>
  );
}

