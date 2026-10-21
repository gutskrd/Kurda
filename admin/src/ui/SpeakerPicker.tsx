/**
 * "Who says it": the character a learner sees saying a recording, or none —
 * a small bust of each of the three, and a plain mark for no one.
 *
 * A radio group, as the keyboard expects one: Tab comes to the chosen option
 * and leaves the group, the arrow keys move along it and choose as they go,
 * Home and End jump to the ends.
 */
import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { CHARACTER_NAMES, SPEAKERS, characterSvg, type SpeakerId } from '@kurda/shared';
import { patchVoice, type AudioKind, type Speaker } from '../voice';
import { errorLine } from './errors';
import { Icon } from './icons';
import { useToast } from './Toast';

const busts = new Map<SpeakerId, string>();

/** A character's bust as a small picture, drawn once and then the same address wherever it is shown. */
export function bustUrl(id: SpeakerId): string {
  let url = busts.get(id);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(characterSvg(id, { crop: 'bust', width: 40 }))}`;
    busts.set(id, url);
  }
  return url;
}

export function speakerName(speaker: Speaker): string {
  return speaker ? CHARACTER_NAMES[speaker] : 'None';
}

export function SpeakerPicker({
  value,
  onChange,
  label = 'Who says it',
  none = true,
  disabled = false,
  hint,
}: {
  value: Speaker;
  onChange: (next: Speaker) => void;
  label?: string;
  /** offer "None" as well as the three */
  none?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}): React.JSX.Element {
  const id = useId();
  const options: Speaker[] = none ? [...SPEAKERS, null] : [...SPEAKERS];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  // the chosen one takes the Tab stop; the first, when none of these is chosen
  const stop = Math.max(0, options.indexOf(value));

  const move = (e: KeyboardEvent, at: number): void => {
    const last = options.length - 1;
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (at + 1) % options.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (at - 1 + options.length) % options.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    refs.current[to]?.focus();
    if (options[to] !== value) onChange(options[to]!);
  };

  return (
    <div className="voice-pick">
      <span className="voice-pick-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="voice-pick-options" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map((speaker, i) => {
          const on = speaker === value;
          return (
            <button
              key={speaker ?? 'none'}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === stop ? 0 : -1}
              className={`voice-pick-option${on ? ' is-on' : ''}`}
              disabled={disabled}
              onClick={() => {
                if (!on) onChange(speaker);
              }}
              onKeyDown={(e) => move(e, i)}
            >
              <span className="voice-pick-face" aria-hidden="true">
                {speaker ? <img src={bustUrl(speaker)} alt="" width={40} height={40} /> : <Icon name="none" size={22} />}
              </span>
              <span className="voice-pick-name">{speakerName(speaker)}</span>
            </button>
          );
        })}
      </div>
      {hint && (
        <div id={`${id}-hint`} className="field-hint">
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Changing who says a recording already saved: shown at once (`apply`), sent
 * to the server one change at a time, and put back with a toast if refused.
 *
 * Arrowing along the picker chooses at every step, so changes can come faster
 * than the server answers. One PATCH per recording is in flight at a time;
 * when it answers, the latest choice is sent if it differs, so the server ends
 * at what the editor ended at and never at a choice passed on the way.
 */
export function useSpeakerChange(
  kind: AudioKind,
  apply: (key: string, speaker: Speaker) => void,
): (change: { key: string; from: Speaker; to: Speaker; label: string }) => void {
  const toast = useToast();
  const latestApply = useRef(apply);
  latestApply.current = apply;
  const pending = useRef(new Map<string, { confirmed: Speaker; wanted: Speaker }>());

  return useCallback(
    ({ key, from, to, label }) => {
      latestApply.current(key, to);
      const queued = pending.current.get(key);
      if (queued) {
        queued.wanted = to;
        return;
      }
      const entry = { confirmed: from, wanted: to };
      pending.current.set(key, entry);
      void (async () => {
        try {
          while (entry.wanted !== entry.confirmed) {
            const target = entry.wanted;
            try {
              await patchVoice(kind, key, { speaker: target });
              entry.confirmed = target;
            } catch (err) {
              entry.wanted = entry.confirmed;
              latestApply.current(key, entry.confirmed);
              toast.error(`Who says “${label}” was not changed. ${errorLine(err)}`);
            }
          }
        } finally {
          pending.current.delete(key);
        }
      })();
    },
    [kind, toast],
  );
}
