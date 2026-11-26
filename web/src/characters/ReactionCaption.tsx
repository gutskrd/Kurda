import { useEffect, useRef, useState } from 'react';
import { REACTION_CAPTION_AFTER_MS, REACTION_NAMES, reactionMeaning } from '@kurda/shared';
import { publicClient } from '../lib/api';
import { useLocale, useT } from '../i18n/I18nProvider';
import { soundPlayer } from '../lib/sound';
import { loadReactions, onReaction, type Speaking } from './reactions';
import { SpeakingCharacter } from './SpeakingCharacter';
import './characters.css';

/** Shown at least this long, however short the line. */
const LEAST_MS = 1800;
/** Kept this long after the meaning is opened, so it can be read. */
const READ_MS = 4000;

/**
 * The line a character is saying (characters/reactions.ts) in a small caption at the top of the page: the Kurmancî, and
 * the character's face saying it when the character is not already drawn on screen. A click shows what it means in the
 * reader's language (a Kurmancî reader has it already). Gone a moment after the line ends. Mounted once for the app,
 * where it also reads the recorded takes.
 */
export function ReactionVoices(): React.JSX.Element | null {
  // The takes are the same for everyone, so they are read without the session and the browser keeps them a while.
  useEffect(() => {
    void loadReactions(publicClient());
  }, []);
  return <ReactionCaption />;
}

export function ReactionCaption(): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const [shown, setShown] = useState<Speaking | null>(null);
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const since = useRef(0);
  const hide = useRef<number | undefined>(undefined);

  useEffect(() => {
    const off = onReaction((s) => {
      window.clearTimeout(hide.current);
      if (s) {
        since.current = Date.now();
        opened.current = false;
        setOpen(false);
        setShown(s);
        return;
      }
      const left = opened.current ? READ_MS : Math.max(REACTION_CAPTION_AFTER_MS, LEAST_MS - (Date.now() - since.current));
      hide.current = window.setTimeout(() => setShown(null), left);
    });
    return () => {
      off();
      window.clearTimeout(hide.current);
    };
  }, []);

  if (!shown) return null;
  const { clip, drawn } = shown;
  const name = REACTION_NAMES[clip.character];
  const meaning = reactionMeaning(clip.line, locale);
  const own = meaning === clip.line.ku;
  const words = (
    <>
      {!drawn && (
        <span className="reaction-caption-face" aria-hidden="true">
          <SpeakingCharacter speaker={clip.character} audio={soundPlayer} src={clip.src} voice={clip.voice} text={clip.line.ku} crop="head" size={34} decorative />
        </span>
      )}
      <span className="reaction-caption-words">
        <span className="sr-only">{t('reactions.says', { name, line: clip.line.ku })}</span>
        <span className="reaction-caption-ku" lang="ku" aria-hidden="true">
          {clip.line.ku}
        </span>
        {open && <span className="reaction-caption-means">{meaning}</span>}
      </span>
    </>
  );
  return (
    <div className="reaction-caption-place">
      {own ? (
        <p className="reaction-caption">{words}</p>
      ) : (
        <button
          type="button"
          className={`reaction-caption is-pressable${open ? ' is-open' : ''}`}
          aria-expanded={open}
          onClick={() => {
            const next = !open;
            opened.current = next;
            setOpen(next);
            window.clearTimeout(hide.current);
            hide.current = window.setTimeout(() => setShown(null), next ? READ_MS : REACTION_CAPTION_AFTER_MS);
          }}
        >
          {words}
        </button>
      )}
    </div>
  );
}
