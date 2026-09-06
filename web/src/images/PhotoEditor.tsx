import { useCallback, useEffect, useRef, useState } from 'react';
import { FONTS, type FontKey } from './photoText';
import {
  ROTATION_RANGE,
  SIZE_RANGE,
  STROKE_RANGE,
  clampLayer,
  drawLayers,
  isPlaced,
  newId,
  signatureBox,
  type Layer,
  type PlacedLayer,
  type StrokeLayer,
} from './layers';
import { ColorPicker } from './ColorPicker';
import { CloseIcon, FeatherIcon, PhotoIcon, TextIcon } from '../components/icons';

/** A small, deliberately unfussy set — a picker of 3000 is a search problem. */
const STICKERS = [
  '❤️', '🔥', '✨', '⭐', '😂', '😍', '😮', '😢', '👍', '👏',
  '🎉', '🌹', '🌞', '🌙', '☕', '🎵', '⚽', '🏔️', '🕊️', '💯',
];

type Tool = 'select' | 'draw';

/**
 * The editor: words, stickers and drawing on a picture.
 *
 * Everything is one list of layers in the order they were added, and everything
 * is positioned as a share of the picture rather than in pixels — a layout
 * arranged here has to land the same way in the stored file, which is a
 * different size.
 *
 * The signature is not a layer and cannot be one. It goes on last, on the
 * server, so nothing anyone adds can end up over the top of it. The editor
 * shades the corner it will occupy so nobody arranges something important there
 * and wonders where it went.
 */
export function PhotoEditor({
  image,
  width,
  height,
  handle,
  layers,
  onChange,
  canvasRef,
}: {
  image: CanvasImageSource;
  width: number;
  height: number;
  handle: string;
  layers: Layer[];
  onChange: (layers: Layer[]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}): React.JSX.Element {
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(0.012);
  const drawing = useRef<StrokeLayer | null>(null);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const selected: PlacedLayer | null =
    layers.find((l): l is PlacedLayer => isPlaced(l) && l.id === selectedId) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawLayers(canvas, image, width, height, layers);
  }, [canvasRef, image, width, height, layers]);

  const update = useCallback(
    (id: string, patch: Partial<PlacedLayer>): void => {
      onChange(layers.map((l) => (isPlaced(l) && l.id === id ? clampLayer({ ...l, ...patch } as Layer) : l)));
    },
    [layers, onChange],
  );

  const add = (layer: Layer): void => {
    onChange([...layers, layer]);
    if (layer.kind !== 'stroke') setSelectedId(layer.id);
  };

  const remove = (id: string): void => {
    onChange(layers.filter((l) => l.id !== id));
    setSelectedId(null);
  };

  /** Where a pointer is, as a share of the picture. */
  const at = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: box.width === 0 ? 0 : (e.clientX - box.left) / box.width,
      y: box.height === 0 ? 0 : (e.clientY - box.top) / box.height,
    };
  };

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);

    if (tool === 'draw') {
      drawing.current = { kind: 'stroke', id: newId(), color, width: strokeWidth, points: [p] };
      onChange([...layers, drawing.current]);
      return;
    }
    // pick the topmost thing near the pointer; nothing near it clears the choice
    const hit = [...layers]
      .reverse()
      .find((l): l is PlacedLayer => isPlaced(l) && Math.hypot(l.x - p.x, l.y - p.y) < 0.12);
    if (hit) {
      setSelectedId(hit.id);
      dragging.current = { id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y };
    } else {
      setSelectedId(null);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (e.buttons === 0) return;
    const p = at(e);

    if (drawing.current) {
      const stroke = drawing.current;
      stroke.points = [...stroke.points, p];
      onChange(layers.map((l) => (l.id === stroke.id ? { ...stroke } : l)));
      return;
    }
    const drag = dragging.current;
    if (drag) update(drag.id, { x: p.x + drag.dx, y: p.y + drag.dy });
  }

  function onPointerUp(): void {
    drawing.current = null;
    dragging.current = null;
  }

  const sig = signatureBox(width, height, handle);

  return (
    <div className="editor">
      <div className="editor-stage">
        <canvas
          ref={canvasRef}
          className={`editor-canvas${tool === 'draw' ? ' is-drawing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {/* the corner the mark will take, so nothing important is put under it */}
        <span
          className="editor-sig-zone"
          style={{
            left: `${(sig.x / width) * 100}%`,
            top: `${(sig.y / height) * 100}%`,
            width: `${(sig.w / width) * 100}%`,
            height: `${(sig.h / height) * 100}%`,
          }}
          aria-hidden
        >
          @{handle}
        </span>
      </div>

      <div className="editor-tools">
        <div className="seg" role="group" aria-label="Tool">
          <button
            type="button"
            className={`seg-btn${tool === 'select' ? ' is-active' : ''}`}
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
          >
            Move
          </button>
          <button
            type="button"
            className={`seg-btn${tool === 'draw' ? ' is-active' : ''}`}
            aria-pressed={tool === 'draw'}
            onClick={() => {
              setTool('draw');
              setSelectedId(null);
            }}
          >
            Draw
          </button>
        </div>

        <div className="editor-adds">
          <button
            type="button"
            className="editor-add"
            onClick={() =>
              add({
                kind: 'text',
                id: newId(),
                value: 'Gotina te',
                font: 'sans',
                size: 0.09,
                color,
                plate: true,
                rotation: 0,
                x: 0.5,
                y: 0.5,
              })
            }
          >
            <TextIcon size={16} /> Words
          </button>
          <button
            type="button"
            className="editor-add"
            onClick={() => add({ kind: 'sticker', id: newId(), glyph: '❤️', size: 0.14, rotation: 0, x: 0.5, y: 0.4 })}
          >
            <FeatherIcon size={16} /> Sticker
          </button>
          {layers.length > 0 && (
            <button type="button" className="editor-add" onClick={() => onChange([])}>
              <PhotoIcon size={16} /> Clear all
            </button>
          )}
        </div>
      </div>

      {tool === 'draw' && (
        <div className="editor-panel">
          <label className="tool-row">
            <span className="tool-label">Brush</span>
            <input
              type="range"
              min={STROKE_RANGE.min * 1000}
              max={STROKE_RANGE.max * 1000}
              value={Math.round(strokeWidth * 1000)}
              aria-label="Brush size"
              onChange={(e) => setStrokeWidth(Number(e.target.value) / 1000)}
            />
          </label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      )}

      {selected && (
        <div className="editor-panel">
          <div className="editor-panel-head">
            <span className="editor-panel-title">{selected.kind === 'text' ? 'Words' : 'Sticker'}</span>
            <button type="button" className="editor-remove" onClick={() => remove(selected.id)} aria-label="Remove this">
              <CloseIcon size={16} />
            </button>
          </div>

          {selected.kind === 'text' ? (
            <>
              <textarea
                className="input"
                rows={2}
                value={selected.value}
                maxLength={280}
                aria-label="Text on the picture"
                onChange={(e) => update(selected.id, { value: e.target.value })}
              />
              <div className="seg" role="group" aria-label="Font">
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`seg-btn${selected.font === f.key ? ' is-active' : ''}`}
                    aria-pressed={selected.font === f.key}
                    style={{ fontFamily: f.stack }}
                    onClick={() => update(selected.id, { font: f.key as FontKey })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="picture-toggle">
                <input
                  type="checkbox"
                  checked={selected.plate}
                  onChange={(e) => update(selected.id, { plate: e.target.checked })}
                />
                <span>Dark backing behind the words</span>
              </label>
            </>
          ) : (
            <div className="sticker-grid" role="group" aria-label="Sticker">
              {STICKERS.map((glyph) => (
                <button
                  key={glyph}
                  type="button"
                  className={`sticker${selected.glyph === glyph ? ' is-on' : ''}`}
                  aria-label={glyph}
                  aria-pressed={selected.glyph === glyph}
                  onClick={() => update(selected.id, { glyph })}
                >
                  {glyph}
                </button>
              ))}
            </div>
          )}

          <label className="tool-row">
            <span className="tool-label">Size</span>
            <input
              type="range"
              min={SIZE_RANGE.min * 100}
              max={SIZE_RANGE.max * 100}
              value={Math.round(selected.size * 100)}
              aria-label="Size"
              onChange={(e) => update(selected.id, { size: Number(e.target.value) / 100 })}
            />
          </label>

          <label className="tool-row">
            <span className="tool-label">Turn</span>
            <input
              type="range"
              min={ROTATION_RANGE.min}
              max={ROTATION_RANGE.max}
              value={Math.round(selected.rotation)}
              aria-label="Turn"
              onChange={(e) => update(selected.id, { rotation: Number(e.target.value) })}
            />
            <span className="tool-value">{Math.round(selected.rotation)}°</span>
          </label>

          {selected.kind === 'text' && (
            <ColorPicker
              value={selected.color}
              onChange={(hex) => {
                setColor(hex);
                update(selected.id, { color: hex });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
