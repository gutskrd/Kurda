import { Fragment, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { formatJoinCode, type GameAccess, type PlayGame } from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon, CopyIcon, ShareIcon, TicketIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion, useInFront } from '../lib/motion';
import { TicketBody, TicketStub, ticketClass } from '../ui/Ticket';
import { GAME_NAME_KEY } from './playApi';

/**
 * A lobby's join code, as a ticket: one component for every game's lobby
 * (Peyvok Battle, Rhyme Match, a story game), so the way to ask somebody in
 * looks and works the same in all three. It is the app's one ticket
 * (ui/Ticket.tsx) stood on end, so it reads as one of a family with every
 * invite a friend is handed.
 *
 * Codes took the place of invite links. A link only works where it can be
 * tapped; a code can be read out across a room, typed on another phone or
 * written on a board, and the friend types it in Games → Join with a code
 * (play/JoinCode.tsx). Friends already on Hevalo are still asked with
 * "Invite friends", which sits beside the code.
 *
 * Each character has a tile in the game's own colour, and the tiles arrive
 * one after another the first time the ticket is shown. Every few seconds a
 * light crosses them, but only while the ticket is on the screen and the tab
 * is in front, and never under Reduce Motion. Copy, or a tap on the code,
 * puts "ABC234" on the clipboard and says so; Share hands the system's share
 * sheet a sentence with the code in it and no address, and copies that
 * sentence where there is no share sheet. A lobby that can no longer be
 * joined has no code (the server clears it), and the ticket goes with it.
 */

/** What Share sends, per game: each game says what you are asking your friend to do. */
const SHARE_KEY: Record<PlayGame, MessageKey> = {
  'wordle-battle': 'play.code.shareBattle',
  'rhyme-match': 'play.code.shareRhymeMatch',
  stories: 'play.code.shareStories',
  'last-letter': 'play.code.shareLastLetter',
};

/** How long Copy wears its tick, and how long a note stays up. */
const COPIED_MS = 2000;
const NOTE_MS = 2800;

async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CodeTicket({
  game,
  code,
  access = 'friends',
  invite,
}: {
  game: PlayGame;
  /** null once the lobby can no longer be joined */
  code: string | null | undefined;
  /** who may join with it, which the hint under it says */
  access?: GameAccess;
  /** "Invite friends", for the host: beside Copy and Share, and on its own when there is no code */
  invite?: React.ReactNode;
}): React.JSX.Element | null {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const inFront = useInFront(ref);
  const [still] = useState(prefersReducedMotion);
  // a count rather than a flag, so every copy throws its little burst again
  const [copies, setCopies] = useState(0);
  const [ticked, setTicked] = useState(false);
  const [note, setNote] = useState<{ text: string; n: number } | null>(null);

  useEffect(() => {
    if (!ticked) return;
    const timer = window.setTimeout(() => setTicked(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [ticked, copies]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  if (!code) return invite ? <div className="code-ticket-alone">{invite}</div> : null;
  const shown = code;

  const say = (text: string): void => setNote({ text, n: Date.now() });

  async function copy(): Promise<void> {
    if (await writeText(shown)) {
      setCopies((n) => n + 1);
      setTicked(true);
      say(t('play.code.copied'));
    } else {
      say(t('play.code.copyFailed'));
    }
  }

  async function share(): Promise<void> {
    const text = t(SHARE_KEY[game], { code: formatJoinCode(shown) });
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t(GAME_NAME_KEY[game]), text });
        return;
      } catch (e) {
        // closing the share sheet is not an error; a sheet that would not open is, and copying is the way left
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    say(t((await writeText(text)) ? 'play.code.shareCopied' : 'play.code.copyFailed'));
  }

  const chars = [...shown];
  const labelId = `${id}-label`;

  return (
    <div
      ref={ref}
      className={ticketClass(game, 'column', `code-ticket code-ticket--${game}${inFront && !still ? ' is-awake' : ''}`)}
      role="group"
      aria-labelledby={labelId}
    >
      <TicketStub className="code-ticket-stub">
        <span className="code-ticket-label" id={labelId}>
          <TicketIcon size={16} />
          {t('play.code.label')}
        </span>
        {/* the code itself copies it too: it is what the eye and the thumb go to first */}
        <button
          type="button"
          className="code-ticket-code"
          dir="ltr"
          onClick={() => void copy()}
          // read out one character at a time: "A B C 2 3 4"
          aria-label={t('play.code.copySpelled', { code: chars.join(' ') })}
        >
          <span className="code-tiles" key={shown} aria-hidden="true">
            {chars.map((ch, i) => (
              <Fragment key={i}>
                {i === chars.length / 2 && <span className="code-tiles-gap" />}
                <span className="code-tile" style={{ '--i': i } as CSSProperties}>
                  {ch}
                </span>
              </Fragment>
            ))}
          </span>
        </button>
      </TicketStub>
      <TicketBody className="code-ticket-body">
        <div className="code-ticket-actions">
          <button type="button" className={`btn btn-secondary btn-sm code-ticket-copy${ticked ? ' is-done' : ''}`} onClick={() => void copy()}>
            <span className="code-ticket-copy-icon" aria-hidden="true">
              <CopyIcon size={16} />
              <CheckIcon size={16} />
              {copies > 0 && !still && <span key={copies} className="code-ticket-burst" />}
            </span>
            {/* both words hold the button's width, so turning into Copied! moves nothing beside it */}
            <span className="code-ticket-copy-labels">
              <span className={ticked ? 'is-off' : undefined} aria-hidden={ticked || undefined}>
                {t('play.code.copy')}
              </span>
              <span className={ticked ? undefined : 'is-off'} aria-hidden={!ticked || undefined}>
                {t('games.copied')}
              </span>
            </span>
          </button>
          <Button variant="secondary" size="sm" onClick={() => void share()}>
            <ShareIcon size={16} />
            {t('play.code.share')}
          </Button>
          {invite}
        </div>
        <p className="code-ticket-hint">{access === 'open' ? t('play.code.hintOpen') : t('play.code.hint')}</p>
      </TicketBody>
      {/* the toast: said to a screen reader as it appears, and gone again on its own */}
      <p className="code-ticket-notes" role="status">
        {note && (
          <span key={note.n} className="code-ticket-note">
            {note.text}
          </span>
        )}
      </p>
    </div>
  );
}
