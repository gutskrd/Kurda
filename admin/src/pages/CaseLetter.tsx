import { useState } from 'react';
import { letterPaperSvg, paintColor, type LetterDecor } from '@kurda/shared';
import { decorLength, letterDecorOf, notePlacement, paperName } from '../moderation';
import { Badge, Icon, useDialogs } from '../ui';

/**
 * A reported letter as its reader saw it: the paper and drawing from the shared art (`letterPaperSvg`) with the notes
 * placed over it, and the notes again as plain text. The drawing is hidden until the moderator chooses to look, as
 * photos are; the paper and the notes' words show at once.
 */
export function LetterPaperEvidence({ raw, sensitive }: { raw: unknown; sensitive: boolean }): React.JSX.Element {
  const { decor, unreadable } = letterDecorOf(raw);
  if (unreadable) {
    return (
      <div className="media-item is-missing">
        <Icon name="alert" />
        <span>The letter’s paper was kept, but cannot be drawn: it no longer reads as a letter’s paper.</span>
      </div>
    );
  }
  if (!decor) return <p className="section-text">Written on the plain default paper, with nothing drawn and no notes.</p>;
  return <LetterSheet decor={decor} sensitive={sensitive} />;
}

function LetterSheet({ decor, sensitive }: { decor: LetterDecor; sensitive: boolean }): React.JSX.Element {
  const [shown, setShown] = useState(false);
  const dialogs = useDialogs();
  const drawn = decor.strokes.length > 0;
  const length = decorLength(decor);
  // Drawn by the shared builder from a decor that has just passed the letter's own checks, and shown as an image, where nothing in it could run.
  const svg = letterPaperSvg({ paper: decor.paper, strokes: drawn && shown ? decor.strokes : [], length, title: 'The letter’s paper' });
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  async function reveal(): Promise<void> {
    if (sensitive) {
      const yes = await dialogs.confirm({
        title: 'Show this drawing?',
        body: 'It may be child sexual abuse material. Look only as much as you need to decide. Never download, forward or screenshot it — the CSAM action keeps the evidence for the report.',
        confirmLabel: 'Show it',
        tone: 'danger',
      });
      if (!yes) return;
    }
    setShown(true);
  }

  return (
    <figure className="letter-sheet">
      <div className="letter-sheet-page" style={{ aspectRatio: `1000 / ${length}` }}>
        <img className="letter-sheet-art" src={src} alt={drawn && shown ? `${paperName(decor.paper)}, drawn on` : paperName(decor.paper)} draggable={false} />
        {decor.notes.map((n, i) => (
          <span key={i} className="letter-sheet-note" dir="auto" style={{ ...notePlacement(n, length), color: paintColor(n.color, decor.paper.tone) }}>
            {n.text}
          </span>
        ))}
        {drawn && !shown && (
          <button type="button" className="media-reveal letter-sheet-reveal" onClick={() => void reveal()}>
            <Icon name="eye" />
            Show drawing
          </button>
        )}
      </div>
      <figcaption>
        <span>{paperName(decor.paper)}</span>
        {drawn ? <Badge tone="warn">{decor.strokes.length === 1 ? 'Drawn on: 1 line' : `Drawn on: ${decor.strokes.length} lines`}</Badge> : <span className="subtle">Nothing drawn</span>}
        {drawn && shown && (
          <button type="button" className="ghost media-hide" onClick={() => setShown(false)}>
            <Icon name="eyeOff" size={16} />
            Hide again
          </button>
        )}
      </figcaption>
      {decor.notes.length > 0 && (
        <div className="letter-notes">
          <h3 className="drawer-sub">{decor.notes.length === 1 ? 'The note on it' : `The ${decor.notes.length} notes on it`}</h3>
          <ol className="plain-list">
            {decor.notes.map((n, i) => (
              <li key={i} dir="auto">
                {n.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </figure>
  );
}
