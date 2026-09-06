import { useEffect, useRef, useState } from 'react';
import {
  formatHsl,
  formatRgb,
  hslToRgb,
  hsvToRgb,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHsl,
  rgbToHsv,
  toHex,
} from './color';

/**
 * Pick a colour: a gradient to point at, a hue to slide, and the three ways of
 * writing it down — any of which you can type into.
 *
 * The hue is held separately from the colour. Drag to pure black and the hue is
 * gone from the colour itself, but the square must not jump back to red; the
 * slider remembers where you were, which is what every picker does and what
 * people expect.
 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}): React.JSX.Element {
  const rgb = parseHex(value) ?? { r: 255, g: 255, b: 255 };
  const hsv = rgbToHsv(rgb);
  const [hue, setHue] = useState(hsv.h);
  const squareRef = useRef<HTMLDivElement>(null);

  // follow the colour when it is changed from outside, but not while it is grey
  // and has no hue of its own to follow
  useEffect(() => {
    if (hsv.s > 0.01 && hsv.v > 0.01) setHue(hsv.h);
  }, [hsv.h, hsv.s, hsv.v]);

  const commit = (next: { r: number; g: number; b: number }): void => onChange(toHex(next));

  /** Point anywhere in the square: across is saturation, down is darkness. */
  const pickAt = (clientX: number, clientY: number): void => {
    const box = squareRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const s = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const v = 1 - Math.min(1, Math.max(0, (clientY - box.top) / box.height));
    commit(hsvToRgb({ h: hue, s, v }));
  };

  const onPointer = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickAt(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.buttons === 0) return;
    pickAt(e.clientX, e.clientY);
  };

  return (
    <div className="cpick">
      <div
        ref={squareRef}
        className="cpick-square"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }}
        role="application"
        aria-label="Colour gradient"
        onPointerDown={onPointer}
        onPointerMove={onPointerMove}
      >
        <span
          className="cpick-dot"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }}
          aria-hidden
        />
      </div>

      <input
        className="cpick-hue"
        type="range"
        min={0}
        max={360}
        value={Math.round(hue)}
        aria-label="Hue"
        onChange={(e) => {
          const h = Number(e.target.value);
          setHue(h);
          commit(hsvToRgb({ h, s: hsv.s, v: hsv.v }));
        }}
      />

      <div className="cpick-fields">
        <Field
          label="Hex"
          value={toHex(rgb)}
          onCommit={(text) => {
            const next = parseHex(text);
            if (next) commit(next);
            return next !== null;
          }}
        />
        <Field
          label="RGB"
          value={formatRgb(rgb)}
          onCommit={(text) => {
            const next = parseRgb(text);
            if (next) commit(next);
            return next !== null;
          }}
        />
        <Field
          label="HSL"
          value={formatHsl(rgbToHsl(rgb))}
          onCommit={(text) => {
            const next = parseHsl(text);
            if (next) commit(hslToRgb(next));
            return next !== null;
          }}
        />
      </div>
    </div>
  );
}

/**
 * One of the three boxes.
 *
 * It holds what you are typing until you finish, because "#3a" on the way to
 * "#3ab26f" is not a colour and the picker must not lurch at every keystroke.
 * A value that never becomes one is put back rather than left looking accepted.
 */
function Field({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (text: string) => boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;

  const finish = (): void => {
    if (draft === null) return;
    onCommit(draft);
    setDraft(null);
  };

  return (
    <label className="cpick-field">
      <span className="cpick-field-label">{label}</span>
      <input
        className="input"
        value={shown}
        aria-label={label}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish();
          } else if (e.key === 'Escape') {
            setDraft(null);
          }
        }}
      />
    </label>
  );
}
