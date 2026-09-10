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
  const t = useT();
  const doc = history.present;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('frame');
  const [stickerTab, setStickerTab] = useState<'marks' | 'emoji'>('marks');
  /**
   * The sticker picker, and what choosing one will do.
   *
   * Adding a sticker used to drop a fixed one onto the picture and leave you to
   * find the grid that changed it into the one you wanted — two steps, in the
   * wrong order, with a wrong sticker on your photograph in between. Now the
   * picker opens first and what you click is what you get.
   */
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'replace'; id: string }>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(0.012);
  const drawing = useRef<StrokeLayer | null>(null);
  /** bumped when overlay artwork finishes decoding, so the draws can catch up */
  const [artReady, setArtReady] = useState(0);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const aspect = aspectOf(doc, iw, ih);
  const size = outputSize(iw, ih, aspect, doc.frame);
  const crop = cropRect(iw, ih, aspect, doc.frame);
  const selectedIndex = doc.layers.findIndex((l) => l.id === selectedId);
  const selected: PlacedLayer | null =
    doc.layers.find((l): l is PlacedLayer => isPlaced(l) && l.id === selectedId) ?? null;

  /* --- ways to change the document ------------------------------------- */
  const setLayers = (layers: Layer[]): void => history.set({ ...doc, layers });
  const previewLayers = (layers: Layer[]): void => history.preview({ ...doc, layers });
  /**
   * Change one layer, and keep it inside the picture.
   *
   * Every route to moving, resizing or turning something goes through here, so
   * this is the one place that has to hold the box inside the frame. Anything
   * hanging over the edge is simply cut off on export, so what is placed here
   * would not be what gets posted.
   */
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
  /** Put the chosen sticker where the picker was opened for. */
  const chooseSticker = (src: string, glyph: string): void => {
    const target = picker;
    if (!target) return;
    // decoded before it lands, so the first draw after it has something to draw
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
   * Select something else, and throw away words that were never typed.
   *
   * "Add words" now puts an empty text layer on the picture, which draws
   * nothing — so if you change your mind and tap elsewhere, it would stay there
   * forever: invisible, and still large enough to catch the next tap aimed at
   * the photograph underneath it. Leaving is how you cancel.
   */
  const select = (id: string | null): void => {
    const stray = doc.layers.find(
      (l): l is PlacedLayer => isPlaced(l) && l.kind === 'text' && l.value.trim() === '' && l.id !== id,
    );
    if (stray) setLayers(doc.layers.filter((l) => l !== stray));
    setSelectedId(id);
  };

  /**
   * Move a layer up or down the stack.
   *
   * The list is the stacking order — later is on top — so this is a swap with
   * the neighbour rather than a sort. Without it, two things placed on the same
   * spot are stuck in the order they happened to be added.
   */
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

  /** A copy, offset a little so it is visibly a second thing and not a no-op. */
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

  /* a filter's artwork has to be decoded before a synchronous draw can use it */
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
    // drawn small: grading costs a pass over every pixel, and this runs on every
    // slider tick. The export is drawn full size, once, when it is posted.
    if (canvas) compose(canvas, image, iw, ih, doc, PREVIEW_MAX_EDGE);
    // `mode` is a dependency because it decides whether this canvas exists at
    // all: framing shows the framer instead, so leaving frame mode mounts a
    // fresh canvas that nothing else would ever draw into — the document has
    // not changed, only what is on screen.
  }, [image, iw, ih, doc, mode, artReady]);

  /**
   * What the keyboard listener should act on, kept current without making it
   * resubscribe. The listener is on the document and lives for the life of the
   * editor; reading these through a ref is what stops it from closing over the
   * selection as it was when the editor mounted.
   */
  const latest = useRef({ selected, patch, remove, select });
  latest.current = { selected, patch, remove, select };

  /**
   * Words with nothing in them yet get the cursor.
   *
   * Pressing "Add words" is a request to write something, so the box should be
   * ready for it — otherwise the next thing you do is hunt for the field you
   * just asked for. Only when it is empty: reselecting words you have already
   * written is usually a prelude to moving them, and stealing focus there would
   * pull a phone's keyboard up over the picture for no reason.
   */
  useEffect(() => {
    // the emptiness test is what makes this run once: the first keystroke ends
    // it, and re-focusing a field that already has focus does nothing anyway
    if (selected?.kind === 'text' && selected.value === '') textRef.current?.focus();
  }, [selectedId, selected]);

  /**
   * Undo and redo from the keyboard, the way every other editor does it.
   *
   * Bound on the document rather than the canvas so it works wherever the
   * cursor happens to be — except inside a field someone is typing in, where
   * the browser's own undo is the one they mean.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // inside a field the browser's own keys are the ones that were meant
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

      // a nudge is one part in two hundred of the picture; with shift, ten of
      // them — fine placement without hunting for the last pixel by hand
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

  /** Where a pointer is, as a share of the picture. */
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
    // pick the topmost thing near the pointer; nothing near it clears the choice
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

  /** A stroke, or a whole drag, becomes one step the moment it ends. */
  function onPointerUp(): void {
    const wasGesture = drawing.current !== null || dragging.current !== null;
    drawing.current = null;
    dragging.current = null;
    if (wasGesture) history.settle();
  }

  /**
   * The document with a different shape, and everything on it pulled back
   * inside. A tall crop is narrower than a wide one, so words that fitted
   * before may not fit now — leaving them where they were would push them off
   * the edge without anyone touching them.
   */
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
          {/* what is selected, and how to change it without leaving the picture */}
          {mode === 'move' && selected && !picker && (
            <LayerHandles
              layer={selected}
              width={size.width}
              height={size.height}
              onPreview={(p) => patch(selected.id, p, true)}
              onSettle={history.settle}
            />
          )}

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
              {m.icon} {t(m.labelKey)}
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
          <div className="seg seg-sub" role="group" aria-label="Shape">
            {ASPECTS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`seg-btn${doc.aspectKey === a.key ? ' is-active' : ''}`}
                aria-pressed={doc.aspectKey === a.key}
                onClick={() => history.set(reshaped(a.key))}
              >
                {t(a.labelKey)}
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
            // a new filter arrives at full strength; turning it down is the
            // next thing you do, not something to have to undo first
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
          {/*
            Words start empty and the box takes the focus.

            This used to stamp "Gotina te" onto the photograph and then offer you
            a box already full of it — so the first thing you did with your own
            picture was select somebody else's placeholder and delete it. Now the
            button opens the box, and what appears on the picture is what you
            type. An empty one is thrown away when you look elsewhere, so
            changing your mind leaves nothing behind.
          */}
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

          {/* two kinds, because fifty-six emoji would bury seven marks in one grid */}
          <div className="seg seg-sub" role="group" aria-label={t('photo.stickerKind')}>
            <button
              type="button"
              className={`seg-btn${stickerTab === 'marks' ? ' is-active' : ''}`}
              aria-pressed={stickerTab === 'marks'}
              onClick={() => setStickerTab('marks')}
            >
              {t('photo.marks')}
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
                    aria-label={p.name}
                    title={p.name}
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

          {/*
            For words, the box comes first — it is the thing you pressed the
            button for. Arranging and restyling only mean anything once there
            is something to arrange, and burying the field under three rows of
            controls is what made "Add words" feel like opening a settings page.
          */}
          {selected.kind === 'text' && (
            <textarea
              ref={textRef}
              className="input editor-words"
              rows={2}
              value={selected.value}
              maxLength={280}
              placeholder={t('photo.typeYourWords')}
              aria-label={t('photo.textOnPicture')}
              // a whole sentence is one step; settling per keystroke would
              // make undo behave like backspace
              onChange={(e) => patch(selected.id, { value: e.target.value }, true)}
              onBlur={history.settle}
            />
          )}

          {/* the list is the stacking order, so this is a swap with the neighbour */}
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
                    {t(f.labelKey)}
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
 * One adjustment.
 *
 * The number is shown only when it is doing something, so a panel of nine
 * sliders reads as "nothing is on" at a glance rather than as nine zeroes. The
 * value emits continuously and settles on release, so dragging one end to end
 * is a single step in the history rather than a hundred.
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
