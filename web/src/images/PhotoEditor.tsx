import { useEffect, useRef, useState } from 'react';
import { FONTS, type FontKey } from './photoText';
import {
  ROTATION_RANGE,
  SIZE_RANGE,
  STROKE_RANGE,
  captureIfPossible,
  clampLayer,
  isPlaced,
  keepInside,
  newId,
  signatureBox,
  type Layer,
  type PlacedLayer,
  type StrokeLayer,
} from './layers';
import { ASPECTS, cropRect, type Frame } from './frame';
import {
  PREVIEW_MAX_EDGE,
  aspectOf,
  compose,
  outputSize,
  type Composition,
} from './composition';
import { ADJUSTMENT_KEYS, ADJUSTMENT_LABEL_KEYS, NEUTRAL, isNeutral, rangeFor, type Adjustments } from './adjust';
import { NO_FILTER, overlaySources } from './filters';
import { FilterStrip } from './FilterStrip';
import { LayerHandles } from './LayerHandles';
import { ImageFramer } from './ImageFramer';
import type { History } from './useHistory';
import { ColorPicker } from './ColorPicker';
import {
  CloseIcon,
  CropIcon,
  DrawIcon,
  FeatherIcon,
  FilterIcon,
  PhotoIcon,
  RedoIcon,
  TextIcon,
  UndoIcon,
} from '../components/icons';
import { EMOJI_STICKERS, PICTURE_STICKERS, emojiSrc, ensureSticker, ensureStickersFor } from './stickers';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Mode = 'frame' | 'filter' | 'move' | 'draw';

const MODES: ReadonlyArray<{ key: Mode; labelKey: MessageKey; icon: React.ReactNode }> = [
  { key: 'frame', labelKey: 'photo.tab.frame', icon: <CropIcon size={16} /> },
  { key: 'filter', labelKey: 'photo.tab.filter', icon: <FilterIcon size={16} /> },
  { key: 'move', labelKey: 'photo.tab.add', icon: <TextIcon size={16} /> },
  { key: 'draw', labelKey: 'photo.tab.draw', icon: <DrawIcon size={16} /> },
];

/**
 * The photo editor: framing first, kept available so re-cropping keeps the layers, then one list of layers in the
 * order added. Positions are shares of the picture so a layout in a small preview lands the same in the stored file.
 * The whole document lives in one history: `set` for a discrete change, `preview` then `settle` for a gesture, so a
 * drag is one undo. The signature is not a layer; the server adds it last, and the editor shades its corner.
 */
export function PhotoEditor({
  image,
  iw,
  ih,
  handle,
  history,
}: {
  image: CanvasImageSource;
  /** The source picture's own pixels. */
  iw: number;
  ih: number;
  handle: string;
  history: History<Composition>;
}): React.JSX.Element {
  const t = useT();
  const doc = history.present;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('frame');
  const [stickerTab, setStickerTab] = useState<'marks' | 'emoji'>('marks');
  /** The sticker picker and what choosing will do: add a new sticker, or replace one. */
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'replace'; id: string }>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(0.012);
  const drawing = useRef<StrokeLayer | null>(null);
  /** Bumped when overlay artwork finishes decoding, so the draws catch up. */
  const [artReady, setArtReady] = useState(0);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const aspect = aspectOf(doc, iw, ih);
  const size = outputSize(iw, ih, aspect, doc.frame);
  const crop = cropRect(iw, ih, aspect, doc.frame);
  const selectedIndex = doc.layers.findIndex((l) => l.id === selectedId);
  const selected: PlacedLayer | null =
    doc.layers.find((l): l is PlacedLayer => isPlaced(l) && l.id === selectedId) ?? null;

  /* --- Ways to change the document --- */
  const setLayers = (layers: Layer[]): void => history.set({ ...doc, layers });
  const previewLayers = (layers: Layer[]): void => history.preview({ ...doc, layers });
  /** Changes one layer and keeps its box inside the picture; every move, resize and turn goes through here. */
  const patch = (id: string, p: Partial<PlacedLayer>, live = false): void => {
    const next = doc.layers.map((l) =>
      isPlaced(l) && l.id === id
        ? keepInside(clampLayer({ ...l, ...p } as Layer) as PlacedLayer, size.width, size.height)
        : l,
    );
    if (live) previewLayers(next);
    else setLayers(next);
  };
  const add = (layer: Layer): void => {
    setLayers([...doc.layers, isPlaced(layer) ? keepInside(layer, size.width, size.height) : layer]);
    if (layer.kind !== 'stroke') setSelectedId(layer.id);
    setMode('move');
  };
  /** Puts the chosen sticker where the picker was opened for. */
  const chooseSticker = (src: string, glyph: string): void => {
    const target = picker;
    if (!target) return;
    // Decoded before it lands, so the next draw has something to draw.
    void ensureSticker(src).then(() => {
      if (target.mode === 'replace') patch(target.id, { src, glyph });
      else add({ kind: 'sticker', id: newId(), glyph, src, size: 0.18, rotation: 0, x: 0.5, y: 0.4 });
      setPicker(null);
    });
  };

  const remove = (id: string): void => {
    setLayers(doc.layers.filter((l) => l.id !== id));
    setSelectedId(null);
  };

  /**
   * Selects something else, discarding words never typed: an empty text layer draws nothing, but would stay and catch
   * taps meant for the photo.
   */
  const select = (id: string | null): void => {
    const stray = doc.layers.find(
      (l): l is PlacedLayer => isPlaced(l) && l.kind === 'text' && l.value.trim() === '' && l.id !== id,
    );
    if (stray) setLayers(doc.layers.filter((l) => l !== stray));
    setSelectedId(id);
  };

  /** Moves a layer one step up or down the stack; the list is the stacking order, later on top. */
  const reorder = (id: string, by: 1 | -1): void => {
    const from = doc.layers.findIndex((l) => l.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= doc.layers.length) return;
    const next = [...doc.layers];
    const moved = next[from]!;
    next[from] = next[to]!;
    next[to] = moved;
    setLayers(next);
  };

  /** A copy, offset a little so it is visibly a second thing. */
  const duplicate = (id: string): void => {
    const found = doc.layers.find((l) => l.id === id);
    if (!found || !isPlaced(found)) return;
    const copy = keepInside(
      { ...found, id: newId(), x: found.x + 0.04, y: found.y + 0.04 },
      size.width,
      size.height,
    );
    setLayers([...doc.layers, copy]);
    setSelectedId(copy.id);
  };

  /* A filter's artwork must be decoded before a synchronous draw can use it. */
  useEffect(() => {
    let live = true;
    void ensureStickersFor(overlaySources()).then(() => {
      if (live) setArtReady((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Drawn small, since grading touches every pixel on every slider tick; the export is drawn full size once.
    if (canvas) compose(canvas, image, iw, ih, doc, PREVIEW_MAX_EDGE);
    // `mode` matters: leaving frame mode mounts a fresh canvas that must be drawn into although the document is unchanged.
  }, [image, iw, ih, doc, mode, artReady]);

  /** The keyboard listener's view of current state, through a ref so it never closes over the selection at mount. */
  const latest = useRef({ selected, patch, remove, select });
  latest.current = { selected, patch, remove, select };

  /** Focuses the text field for words not yet written; reselecting written words usually means moving them, so no focus. */
  useEffect(() => {
    // The emptiness check makes this run once: the first keystroke ends it.
    if (selected?.kind === 'text' && selected.value === '') textRef.current?.focus();
  }, [selectedId, selected]);

  /** Undo and redo from the keyboard, on the document, except inside a field where the browser's own undo applies. */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Inside a field the browser's own keys are meant.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) history.redo();
        else history.undo();
        return;
      }

      const target = latest.current.selected;
      if (!target) return;

      if (e.key === 'Escape') {
        latest.current.select(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        latest.current.remove(target.id);
        return;
      }

      // A nudge is 1/200 of the picture, ten times that with shift.
      const step = e.shiftKey ? 0.05 : 0.005;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[e.key];
      if (!move) return;
      e.preventDefault();
      latest.current.patch(target.id, { x: target.x + move[0], y: target.y + move[1] });
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [history]);

  /** A pointer's position as a share of the picture. */
  const at = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: box.width === 0 ? 0 : (e.clientX - box.left) / box.width,
      y: box.height === 0 ? 0 : (e.clientY - box.top) / box.height,
    };
  };

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    captureIfPossible(e.currentTarget, e.pointerId);
    const p = at(e);

    if (mode === 'draw') {
      drawing.current = { kind: 'stroke', id: newId(), color, width: strokeWidth, points: [p] };
      previewLayers([...doc.layers, drawing.current]);
      return;
    }
    // Pick the topmost thing near the pointer; nothing near clears the selection.
    const hit = [...doc.layers]
      .reverse()
      .find((l): l is PlacedLayer => isPlaced(l) && Math.hypot(l.x - p.x, l.y - p.y) < 0.12);
    if (hit) {
      select(hit.id);
      dragging.current = { id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y };
    } else {
      select(null);
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

  /** A stroke or drag becomes one history step when it ends. */
  function onPointerUp(): void {
    const wasGesture = drawing.current !== null || dragging.current !== null;
    drawing.current = null;
    dragging.current = null;
    if (wasGesture) history.settle();
  }

  /** The document in another shape, with every layer pulled back inside, since a taller crop is narrower. */
  const reshaped = (aspectKey: string): Composition => {
    const next = { ...doc, aspectKey };
    const fitted = outputSize(iw, ih, aspectOf(next, iw, ih), next.frame);
    return {
      ...next,
      layers: next.layers.map((l) => (isPlaced(l) ? keepInside(l, fitted.width, fitted.height) : l)),
    };
  };

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
          {/* The selection's controls, on the picture. */}
          {mode === 'move' && selected && !picker && (
            <LayerHandles
              layer={selected}
              width={size.width}
              height={size.height}
              onPreview={(p) => patch(selected.id, p, true)}
              onSettle={history.settle}
            />
          )}

          {/* The corner the mark will take, so nothing important goes under it. */}
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
        <h3 className="editor-title">{t('photo.title')}</h3>
        {mode === 'frame' && (
          <p className="editor-hint">{t('photo.hint.frame')}</p>
        )}
        {mode === 'filter' && (
          <p className="editor-hint">{t('photo.hint.filter')}</p>
        )}
        {(mode === 'move' || mode === 'draw') && doc.layers.length === 0 && (
          <p className="editor-hint">{t('photo.hint.add')}</p>
        )}
      </div>

      <div className="editor-modes">
        <div className="seg" role="group" aria-label={t('photo.tool')}>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`seg-btn${mode === m.key ? ' is-active' : ''}`}
              aria-pressed={mode === m.key}
              onClick={() => {
                setMode(m.key);
                if (m.key !== 'move') select(null);
              }}
            >
              <span className="seg-btn-label">{m.icon} {t(m.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Undo and redo sit apart from the controls that make changes. */}
        <div className="editor-history">
          <button
            type="button"
            className="editor-history-btn"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label={t('photo.undo')}
            title={t('photo.undoShortcut')}
          >
            <UndoIcon size={17} />
          </button>
          <button
            type="button"
            className="editor-history-btn"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label={t('photo.redo')}
            title={t('photo.redoShortcut')}
          >
            <RedoIcon size={17} />
          </button>
        </div>
      </div>

      {mode === 'frame' && (
        <div className="editor-panel">
          <div className="seg seg-sub" role="group" aria-label={t('photo.shape')}>
            {ASPECTS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`seg-btn${doc.aspectKey === a.key ? ' is-active' : ''}`}
                aria-pressed={doc.aspectKey === a.key}
                onClick={() => history.set(reshaped(a.key))}
              >
                <span className="seg-btn-label">{t(a.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'filter' && (
        <div className="editor-panel">
          <FilterStrip
            image={image}
            crop={crop}
            artReady={artReady}
            activeKey={doc.filterKey}
            // A new filter starts at full strength.
            onPick={(filterKey) => history.set({ ...doc, filterKey, strength: 1 })}
          />

          {doc.filterKey !== NO_FILTER && (
            <label className="tool-row">
              <span className="tool-label">{t('photo.strength')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(doc.strength * 100)}
                aria-label={t('photo.filterStrength')}
                onChange={(e) => history.preview({ ...doc, strength: Number(e.target.value) / 100 })}
                onPointerUp={history.settle}
                onKeyUp={history.settle}
              />
              <span className="tool-value">{Math.round(doc.strength * 100)}</span>
            </label>
          )}

          <div className="editor-panel-head editor-adjust-head">
            <span className="editor-panel-title">{t('photo.adjust')}</span>
            <button
              type="button"
              className="link-button"
              disabled={isNeutral(doc.adjustments)}
              onClick={() => history.set({ ...doc, adjustments: NEUTRAL })}
            >
              {t('photo.reset')}
            </button>
          </div>

          <div className="editor-adjust">
            {ADJUSTMENT_KEYS.map((key) => (
              <AdjustRow
                key={key}
                name={key}
                value={doc.adjustments[key]}
                onPreview={(v) => history.preview({ ...doc, adjustments: { ...doc.adjustments, [key]: v } })}
                onSettle={history.settle}
              />
            ))}
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div className="editor-adds">
          {/* Words start empty with the box focused; an empty one is discarded on selecting elsewhere. */}
          <button
            type="button"
            className="editor-add"
            onClick={() =>
              add({
                kind: 'text',
                id: newId(),
                value: '',
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
            <TextIcon size={16} /> {t('photo.addWords')}
          </button>
          <button
            type="button"
            className="editor-add"
            aria-expanded={picker !== null}
            onClick={() => setPicker({ mode: 'add' })}
          >
            <FeatherIcon size={16} /> {t('photo.addSticker')}
          </button>
          {doc.layers.length > 0 && (
            <button type="button" className="editor-add" onClick={() => setLayers([])}>
              <PhotoIcon size={16} /> {t('photo.clearAll')}
            </button>
          )}
        </div>
      )}

      {mode === 'move' && picker && (
        <div className="editor-panel">
          <div className="editor-panel-head">
            <span className="editor-panel-title">
              {picker.mode === 'replace' ? t('photo.swapSticker') : t('photo.pickSticker')}
            </span>
            <button
              type="button"
              className="editor-remove"
              onClick={() => setPicker(null)}
              aria-label={t('photo.closeStickers')}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Two kinds, so the emoji do not bury the marks in one grid. */}
          <div className="seg seg-sub" role="group" aria-label={t('photo.stickerKind')}>
            <button
              type="button"
              className={`seg-btn${stickerTab === 'marks' ? ' is-active' : ''}`}
              aria-pressed={stickerTab === 'marks'}
              onClick={() => setStickerTab('marks')}
            >
              <span className="seg-btn-label">{t('photo.marks')}</span>
            </button>
            <button
              type="button"
              className={`seg-btn${stickerTab === 'emoji' ? ' is-active' : ''}`}
              aria-pressed={stickerTab === 'emoji'}
              onClick={() => setStickerTab('emoji')}
            >
              <span className="seg-btn-label">{t('photo.emoji')}</span>
            </button>
          </div>

          <div
            className={`sticker-grid ${stickerTab === 'marks' ? 'sticker-grid-pics' : 'sticker-grid-emoji'}`}
            role="group"
            aria-label={t('photo.stickers')}
          >
            {stickerTab === 'marks'
              ? PICTURE_STICKERS.map((p) => (
                  <button
                    key={p.src}
                    type="button"
                    className="sticker sticker-pic"
                    aria-label={p.labelKey ? t(p.labelKey) : p.name}
                    title={p.labelKey ? t(p.labelKey) : p.name}
                    onClick={() => chooseSticker(p.src, p.name)}
                  >
                    <img src={p.src} alt="" />
                  </button>
                ))
              : EMOJI_STICKERS.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    className="sticker sticker-pic"
                    aria-label={e.glyph}
                    title={e.glyph}
                    onClick={() => chooseSticker(emojiSrc(e.key), e.glyph)}
                  >
                    <img src={emojiSrc(e.key)} alt="" loading="lazy" />
                  </button>
                ))}
          </div>
        </div>
      )}

      {mode === 'draw' && (
        <div className="editor-panel">
          <label className="tool-row">
            <span className="tool-label">{t('photo.brush')}</span>
            <input
              type="range"
              min={STROKE_RANGE.min * 1000}
              max={STROKE_RANGE.max * 1000}
              value={Math.round(strokeWidth * 1000)}
              aria-label={t('photo.brushSize')}
              onChange={(e) => setStrokeWidth(Number(e.target.value) / 1000)}
            />
          </label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      )}

      {mode === 'move' && selected && !picker && (
        <div className="editor-panel">
          <div className="editor-panel-head">
            <span className="editor-panel-title">{selected.kind === 'text' ? t('photo.words') : t('photo.sticker')}</span>
            <button type="button" className="editor-remove" onClick={() => remove(selected.id)} aria-label={t('photo.removeThis')}>
              <CloseIcon size={16} />
            </button>
          </div>

          {/* For words, the text box comes first; arranging and styling come after. */}
          {selected.kind === 'text' && (
            <textarea
              ref={textRef}
              className="input editor-words"
              rows={2}
              value={selected.value}
              maxLength={280}
              placeholder={t('photo.typeYourWords')}
              aria-label={t('photo.textOnPicture')}
              // A whole edit is one step, so undo does not behave like backspace.
              onChange={(e) => patch(selected.id, { value: e.target.value }, true)}
              onBlur={history.settle}
            />
          )}

          {/* The list is the stacking order, so this swaps with the neighbour. */}
          <div className="layer-actions">
            <button
              type="button"
              className="editor-add"
              disabled={selectedIndex >= doc.layers.length - 1}
              onClick={() => reorder(selected.id, 1)}
            >
              {t('photo.bringForward')}
            </button>
            <button
              type="button"
              className="editor-add"
              disabled={selectedIndex <= 0}
              onClick={() => reorder(selected.id, -1)}
            >
              {t('photo.sendBack')}
            </button>
            <button type="button" className="editor-add" onClick={() => duplicate(selected.id)}>
              {t('photo.duplicate')}
            </button>
          </div>
          <p className="editor-hint">
            {t('photo.layerHint')}
          </p>

          {selected.kind === 'text' ? (
            <>
              <div className="seg" role="group" aria-label={t('photo.font')}>
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`seg-btn${selected.font === f.key ? ' is-active' : ''}`}
                    aria-pressed={selected.font === f.key}
                    style={{ fontFamily: f.stack }}
                    onClick={() => patch(selected.id, { font: f.key as FontKey })}
                  >
                    <span className="seg-btn-label">{t(f.labelKey)}</span>
                  </button>
                ))}
              </div>
              <label className="picture-toggle">
                <input
                  type="checkbox"
                  checked={selected.plate}
                  onChange={(e) => patch(selected.id, { plate: e.target.checked })}
                />
                <span>{t('photo.textBacking')}</span>
              </label>
            </>
          ) : (
            <button
              type="button"
              className="editor-add"
              onClick={() => setPicker({ mode: 'replace', id: selected.id })}
            >
              <FeatherIcon size={16} /> {t('photo.swapStickerShort')}
            </button>
          )}

          <label className="tool-row">
            <span className="tool-label">{t('photo.size')}</span>
            <input
              type="range"
              min={SIZE_RANGE.min * 100}
              max={SIZE_RANGE.max * 100}
              value={Math.round(selected.size * 100)}
              aria-label={t('photo.size')}
              onChange={(e) => patch(selected.id, { size: Number(e.target.value) / 100 }, true)}
              onPointerUp={history.settle}
              onKeyUp={history.settle}
            />
          </label>

          <label className="tool-row">
            <span className="tool-label">{t('photo.turn')}</span>
            <input
              type="range"
              min={ROTATION_RANGE.min}
              max={ROTATION_RANGE.max}
              value={Math.round(selected.rotation)}
              aria-label={t('photo.turn')}
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

/**
 * One adjustment slider. The number shows only when non-zero, so the panel reads as "nothing on" at a glance. It
 * previews while dragging and settles on release, so a drag is one history step.
 */
function AdjustRow({
  name,
  value,
  onPreview,
  onSettle,
}: {
  name: keyof Adjustments;
  value: number;
  onPreview: (value: number) => void;
  onSettle: () => void;
}): React.JSX.Element {
  const t = useT();
  const range = rangeFor(name);
  return (
    <label className={`tool-row${value !== 0 ? ' is-set' : ''}`}>
      <span className="tool-label">{t(ADJUSTMENT_LABEL_KEYS[name])}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        value={Math.round(value)}
        aria-label={t(ADJUSTMENT_LABEL_KEYS[name])}
        onChange={(e) => onPreview(Number(e.target.value))}
        onPointerUp={onSettle}
        onKeyUp={onSettle}
        onDoubleClick={() => {
          onPreview(0);
          onSettle();
        }}
      />
      <span className="tool-value">{value === 0 ? '' : Math.round(value)}</span>
    </label>
  );
}
