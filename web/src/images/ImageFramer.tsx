import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WHOLE_PICTURE,
  ZOOM_RANGE,
  cropRect,
  isWholePicture,
  maxZoomFor,
  panFrame,
  zoomFrame,
  type Frame,
} from './frame';
import { drawLayers } from './layers';

/** How far one wheel notch moves the zoom. */
const WHEEL_STEP = 0.0016;
/** A keyboard nudge, as a share of the box. */
const KEY_NUDGE = 0.04;

/**
 * Decide what part of a picture is the picture.
 *
 * Drag it, pinch it, roll the wheel over it, or use the slider — they all end
 * up in the same place, a `Frame`, which is a zoom and a centre held in shares
 * of the source image rather than pixels on screen. Nothing here knows the size
 * of the box except to convert a gesture into that, so one framing lands
 * identically in a 300px preview and a 1440px export.
 *
 * The picture can never be dragged out from under the frame: zoom starts at
 * "the largest crop of this shape that fits", so no arrangement shows a gap and
 * there is no empty background to design.
 *
 * `onChange` fires continuously through a gesture and `onSettled` once at the
 * end of one, which is what lets an undo history record a whole drag as a
 * single step instead of four hundred of them.
 */
export function ImageFramer({
  image,
  iw,
  ih,
  aspect,
  frame,
  onChange,
  onSettled,
  round = false,
  busy = false,
}: {
  image: CanvasImageSource;
  iw: number;
  ih: number;
  aspect: number;
  frame: Frame;
  onChange: (frame: Frame) => void;
  onSettled?: () => void;
  /** show the crop through a circle, for a picture that renders as an avatar */
  round?: boolean;
  busy?: boolean;
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** live pointers, so two of them can be told from one */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  /* the drawn size follows the box; a canvas sized once is a blurry canvas */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = (): void => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.w === 0 || box.h === 0) return;
    // drawn at device resolution so the preview is not soft on a phone, but no
    // finer than that: this canvas is thrown away, only the export is kept
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    drawLayers(
      canvas,
      image,
      Math.round(box.w * dpr),
      Math.round(box.h * dpr),
      [],
      cropRect(iw, ih, aspect, frame),
    );
  }, [image, iw, ih, aspect, frame, box]);

  const settle = useCallback((): void => onSettled?.(), [onSettled]);

  /*
   * Where the slider ends, which is a property of this picture rather than a
   * constant: a 12-megapixel photo gets the whole range, one that has already
   * been round the internet stops early. Going past it could only hand back an
   * upscale of itself.
   */
  const maxZoom = maxZoomFor(iw, ih, aspect);
  const atCeiling = frame.zoom >= maxZoom - 1e-6;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { dist: spread(pointers.current), zoom: frame.zoom };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || busy) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();

    // two fingers: the gap between them is the zoom, their middle is the anchor
    const grip = pinch.current;
    if (grip && pointers.current.size === 2) {
      const now = spread(pointers.current);
      if (grip.dist > 0) {
        const mid = middle(pointers.current);
        onChange(
          zoomFrame(
            iw,
            ih,
            aspect,
            frame,
            (grip.zoom * now) / grip.dist,
            rect.width === 0 ? 0.5 : (mid.x - rect.left) / rect.width,
            rect.height === 0 ? 0.5 : (mid.y - rect.top) / rect.height,
          ),
        );
      }
      return;
    }
    if (pointers.current.size !== 1) return;
    onChange(panFrame(iw, ih, aspect, frame, e.clientX - prev.x, e.clientY - prev.y, box.w, box.h));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) settle();
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>): void {
    if (busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onChange(
      zoomFrame(
        iw,
        ih,
        aspect,
        frame,
        frame.zoom * (1 - e.deltaY * WHEEL_STEP),
        rect.width === 0 ? 0.5 : (e.clientX - rect.left) / rect.width,
        rect.height === 0 ? 0.5 : (e.clientY - rect.top) / rect.height,
      ),
    );
    // a wheel has no end, so each notch is its own step in the history
    settle();
  }

  /** Arrows nudge, plus and minus zoom: framing without a mouse or a screen to touch. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (busy) return;
    const nudge = (dx: number, dy: number): void => {
      e.preventDefault();
      onChange(panFrame(iw, ih, aspect, frame, dx * box.w * KEY_NUDGE, dy * box.h * KEY_NUDGE, box.w, box.h));
      settle();
    };
    const step = (by: number): void => {
      e.preventDefault();
      onChange(zoomFrame(iw, ih, aspect, frame, frame.zoom + by));
      settle();
    };
    if (e.key === 'ArrowLeft') nudge(1, 0);
    else if (e.key === 'ArrowRight') nudge(-1, 0);
    else if (e.key === 'ArrowUp') nudge(0, 1);
    else if (e.key === 'ArrowDown') nudge(0, -1);
    else if (e.key === '+' || e.key === '=') step(0.2);
    else if (e.key === '-' || e.key === '_') step(-0.2);
  }

  return (
    <div className="framer">
      <div
        ref={boxRef}
        className={`framer-stage${round ? ' is-round' : ''}`}
        style={{ aspectRatio: String(aspect), '--framer-aspect': String(aspect) } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        role="application"
        tabIndex={0}
        aria-label="Drag to move the picture. Arrow keys nudge it, plus and minus zoom."
      >
        <canvas ref={canvasRef} className="framer-canvas" />
        {/* thirds, the way a camera shows them, and only while it is being moved */}
        <span className="framer-grid" aria-hidden />
      </div>

      <div className="framer-controls">
        <button
          type="button"
          className="framer-zoom-btn"
          aria-label="Zoom out"
          disabled={busy || frame.zoom <= ZOOM_RANGE.min}
          onClick={() => {
            onChange(zoomFrame(iw, ih, aspect, frame, frame.zoom - 0.25));
            settle();
          }}
        >
          &minus;
        </button>
        <input
          type="range"
          className="framer-zoom"
          min={ZOOM_RANGE.min * 100}
          max={Math.round(maxZoom * 100)}
          value={Math.round(frame.zoom * 100)}
          aria-label="Zoom"
          disabled={busy}
          onChange={(e) => onChange(zoomFrame(iw, ih, aspect, frame, Number(e.target.value) / 100))}
          onPointerUp={settle}
          onKeyUp={settle}
        />
        <button
          type="button"
          className="framer-zoom-btn"
          aria-label="Zoom in"
          disabled={busy || atCeiling}
          onClick={() => {
            onChange(zoomFrame(iw, ih, aspect, frame, frame.zoom + 0.25));
            settle();
          }}
        >
          +
        </button>
        <button
          type="button"
          className="link-button framer-reset"
          disabled={busy || isWholePicture(frame)}
          onClick={() => {
            onChange(WHOLE_PICTURE);
            settle();
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function spread(pts: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...pts.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function middle(pts: Map<number, { x: number; y: number }>): { x: number; y: number } {
  const [a, b] = [...pts.values()];
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
}
