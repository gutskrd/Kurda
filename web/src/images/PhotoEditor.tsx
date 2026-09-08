import { useEffect, useRef, useState } from 'react';
import { FONTS, type FontKey } from './photoText';
import {
  ROTATION_RANGE,
  SIZE_RANGE,
  STROKE_RANGE,
  clampLayer,
  isPlaced,
  newId,
  signatureBox,
  type Layer,
  type PlacedLayer,
  type StrokeLayer,
} from './layers';
import { ASPECTS, type Frame } from './frame';
import { aspectOf, compose, outputSize, type Composition } from './composition';
import { ImageFramer } from './ImageFramer';
import type { History } from './useHistory';
import { ColorPicker } from './ColorPicker';
import {
  CloseIcon,
  CropIcon,
  DrawIcon,
  FeatherIcon,
  PhotoIcon,
  RedoIcon,
  TextIcon,
  UndoIcon,
} from '../components/icons';
import { EMOJI_STICKERS, PICTURE_STICKERS, ensureSticker } from './stickers';

type Mode = 'frame' | 'move' | 'draw';

const MODES: ReadonlyArray<{ key: Mode; label: string; icon: React.ReactNode }> = [
  { key: 'frame', label: 'Frame', icon: <CropIcon size={16} /> },
  { key: 'move', label: 'Add', icon: <TextIcon size={16} /> },
  { key: 'draw', label: 'Draw', icon: <DrawIcon size={16} /> },
];

/**
 * The editor: what part of the picture, and what goes on top of it.
 *
 * Framing comes first because it is the first decision — a picture is not
 * finished being chosen until you have said which part of it you meant — and it
 * stays available afterwards, so re-cropping does not mean throwing away the
 * words you already placed. Everything else is one list of layers in the order
 * they were added.
 *
 * Every position is a share of the picture rather than a pixel, because a
 * layout arranged in a 300px preview has to land identically in the stored file
 * at whatever size the server keeps.
 *
 * The whole document — the crop, the shape, the layers — lives in one history,
 * so undo takes back the last thing you did whatever kind of thing it was.
 * Changes arrive through it in two ways: `set` for something discrete, and
 * `preview` then `settle` for a gesture, so one long drag costs one undo.
 *
 * The signature is not a layer and cannot be one. It goes on last, on the
 * server, so nothing anyone adds can end up over the top of it. The editor
 * shades the corner it will occupy so nobody arranges something important there
 * and wonders where it went.
 */
export function PhotoEditor({
  image,
  iw,
  ih,
  handle,
  history,
}: {
  image: CanvasImageSource;
  /** the source picture's own pixels */
  iw: number;
  ih: number;
  handle: string;
  history: History<Composition>;
}): React.JSX.Element {
  const doc = history.present;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('frame');
  const [stickerTab, setStickerTab] = useState<'marks' | 'emoji'>('marks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(0.012);
  const drawing = useRef<StrokeLayer | null>(null);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const aspect = aspectOf(doc, iw, ih);
  const size = outputSize(iw, ih, aspect);
  const selected: PlacedLayer | null =
    doc.layers.find((l): l is PlacedLayer => isPlaced(l) && l.id === selectedId) ?? null;

  /* --- ways to change the document ------------------------------------- */
  const setLayers = (layers: Layer[]): void => history.set({ ...doc, layers });
  const previewLayers = (layers: Layer[]): void => history.preview({ ...doc, layers });
  const patch = (id: string, p: Partial<PlacedLayer>, live = false): void => {
    const next = doc.layers.map((l) => (isPlaced(l) && l.id === id ? clampLayer({ ...l, ...p } as Layer) : l));
    if (live) previewLayers(next);
    else setLayers(next);
  };
  const add = (layer: Layer): void => {
    setLayers([...doc.layers, layer]);
    if (layer.kind !== 'stroke') setSelectedId(layer.id);
    setMode('move');
  };
  const remove = (id: string): void => {
    setLayers(doc.layers.filter((l) => l.id !== id));
    setSelectedId(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) compose(canvas, image, iw, ih, doc);
  }, [image, iw, ih, doc]);

  /**
   * Undo and redo from the keyboard, the way every other editor does it.
   *
   * Bound on the document rather than the canvas so it works wherever the
   * cursor happens to be — except inside a field someone is typing in, where
   * the browser's own undo is the one they mean.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) history.redo();
      else history.undo();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [history]);

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

    if (mode === 'draw') {
      drawing.current = { kind: 'stroke', id: newId(), color, width: strokeWidth, points: [p] };
      previewLayers([...doc.layers, drawing.current]);
      return;
    }
    // pick the topmost thing near the pointer; nothing near it clears the choice
    const hit = [...doc.layers]
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
      previewLayers(doc.layers.map((l) => (l.id === stroke.id ? { ...stroke } : l)));
      return;
    }
    const drag = dragging.current;
    if (drag) patch(drag.id, { x: p.x + drag.dx, y: p.y + drag.dy }, true);
  }

  /** A stroke, or a whole drag, becomes one step the moment it ends. */
  function onPointerUp(): void {
    const wasGesture = drawing.current !== null || dragging.current !== null;
    drawing.current = null;
    dragging.current = null;
    if (wasGesture) history.settle();
  }

  const sig = signatureBox(size.width, size.height, handle);

  return (
    <div className="editor">
      {mode === 'frame' ? (
        <ImageFramer
          image={image}
          iw={iw}
          ih={ih}
          aspect={aspect}
          frame={doc.frame}
          onChange={(frame: Frame) => history.preview({ ...doc, frame })}
          onSettled={history.settle}
        />
      ) : (
        <div className="editor-stage">
          <canvas
            ref={canvasRef}
            className={`editor-canvas${mode === 'draw' ? ' is-drawing' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {/* the corner the mark will take, so nothing important is put under it */}
          <span
            className="editor-sig-zone"
            style={{
              left: `${(sig.x / size.width) * 100}%`,
              top: `${(sig.y / size.height) * 100}%`,
              width: `${(sig.w / size.width) * 100}%`,
              height: `${(sig.h / size.height) * 100}%`,
            }}
            aria-hidden
          >
            @{handle}
          </span>
        </div>
      )}

      <div className="editor-head">
        <h3 className="editor-title">Edit your picture</h3>
        {mode === 'frame' && (
          <p className="editor-hint">Drag it to choose what’s in the frame, and pinch or scroll to zoom.</p>
        )}
        {mode !== 'frame' && doc.layers.length === 0 && (
          <p className="editor-hint">Add words or a sticker, or draw on it — then drag to move.</p>
        )}
      </div>

      <div className="editor-modes">
        <div className="seg" role="group" aria-label="Tool">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`seg-btn${mode === m.key ? ' is-active' : ''}`}
              aria-pressed={mode === m.key}
              onClick={() => {
                setMode(m.key);
                if (m.key !== 'move') setSelectedId(null);
              }}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* taking something back lives away from everything that makes a change */}
        <div className="editor-history">
          <button
            type="button"
            className="editor-history-btn"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <UndoIcon size={17} />
          </button>
          <button
            type="button"
            className="editor-history-btn"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <RedoIcon size={17} />
          </button>
        </div>
      </div>

      {mode === 'frame' && (
        <div className="editor-panel">
          <div className="seg seg-sub" role="group" aria-label="Shape">
            {ASPECTS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`seg-btn${doc.aspectKey === a.key ? ' is-active' : ''}`}
                aria-pressed={doc.aspectKey === a.key}
                onClick={() => history.set({ ...doc, aspectKey: a.key })}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'move' && (
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
            <TextIcon size={16} /> Add words
          </button>
          <button
            type="button"
            className="editor-add"
            onClick={() => {
              // a mark by default, matching the tab the picker opens on
              const first = PICTURE_STICKERS[0]!;
              void ensureSticker(first.src).then(() =>
                add({ kind: 'sticker', id: newId(), glyph: '❤️', src: first.src, size: 0.18, rotation: 0, x: 0.5, y: 0.4 }),
              );
            }}
          >
            <FeatherIcon size={16} /> Add a sticker
          </button>
          {doc.layers.length > 0 && (
            <button type="button" className="editor-add" onClick={() => setLayers([])}>
              <PhotoIcon size={16} /> Clear all
            </button>
          )}
        </div>
      )}

      {mode === 'draw' && (
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

      {mode === 'move' && selected && (
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
                // a whole sentence is one step; settling per keystroke would
                // make undo behave like backspace
                onChange={(e) => patch(selected.id, { value: e.target.value }, true)}
                onBlur={history.settle}
              />
              <div className="seg" role="group" aria-label="Font">
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`seg-btn${selected.font === f.key ? ' is-active' : ''}`}
                    aria-pressed={selected.font === f.key}
                    style={{ fontFamily: f.stack }}
                    onClick={() => patch(selected.id, { font: f.key as FontKey })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="picture-toggle">
                <input
                  type="checkbox"
                  checked={selected.plate}
                  onChange={(e) => patch(selected.id, { plate: e.target.checked })}
                />
                <span>Dark backing behind the words</span>
              </label>
            </>
          ) : (
            <>
              {/* two kinds of sticker, and a hundred emoji would bury seven
                  marks if they shared one grid */}
              <div className="seg seg-sub" role="group" aria-label="Sticker kind">
                <button
                  type="button"
                  className={`seg-btn${stickerTab === 'marks' ? ' is-active' : ''}`}
                  aria-pressed={stickerTab === 'marks'}
                  onClick={() => setStickerTab('marks')}
                >
                  Nîşan
                </button>
                <button
                  type="button"
                  className={`seg-btn${stickerTab === 'emoji' ? ' is-active' : ''}`}
                  aria-pressed={stickerTab === 'emoji'}
                  onClick={() => setStickerTab('emoji')}
                >
                  Emoji
                </button>
              </div>

              {stickerTab === 'marks' ? (
                <div className="sticker-grid sticker-grid-pics" role="group" aria-label="Sticker">
                  {PICTURE_STICKERS.map((s) => (
                    <button
                      key={s.src}
                      type="button"
                      className={`sticker sticker-pic${selected.src === s.src ? ' is-on' : ''}`}
                      aria-label={s.name}
                      title={s.name}
                      aria-pressed={selected.src === s.src}
                      onClick={() => {
                        // load before selecting, so the first draw has something
                        void ensureSticker(s.src).then(() => patch(selected.id, { src: s.src }));
                      }}
                    >
                      <img src={s.src} alt="" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="sticker-grid" role="group" aria-label="Sticker">
                  {EMOJI_STICKERS.map((glyph) => (
                    <button
                      key={glyph}
                      type="button"
                      className={`sticker${selected.glyph === glyph && !selected.src ? ' is-on' : ''}`}
                      aria-label={glyph}
                      aria-pressed={selected.glyph === glyph && !selected.src}
                      // clearing src is what turns a picture back into a character
                      onClick={() => patch(selected.id, { glyph, src: undefined })}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <label className="tool-row">
            <span className="tool-label">Size</span>
            <input
              type="range"
              min={SIZE_RANGE.min * 100}
              max={SIZE_RANGE.max * 100}
              value={Math.round(selected.size * 100)}
              aria-label="Size"
              onChange={(e) => patch(selected.id, { size: Number(e.target.value) / 100 }, true)}
              onPointerUp={history.settle}
              onKeyUp={history.settle}
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
              onChange={(e) => patch(selected.id, { rotation: Number(e.target.value) }, true)}
              onPointerUp={history.settle}
              onKeyUp={history.settle}
            />
            <span className="tool-value">{Math.round(selected.rotation)}°</span>
          </label>

          {selected.kind === 'text' && (
            <ColorPicker
              value={selected.color}
              onChange={(hex) => {
                setColor(hex);
                patch(selected.id, { color: hex });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

