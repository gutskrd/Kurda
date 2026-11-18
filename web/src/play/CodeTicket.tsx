import { Fragment, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { buildJoinLink, formatJoinCode, type GameAccess, type PlayGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CheckIcon, CopyIcon, ShareIcon, TicketIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion, useInFront } from '../lib/motion';
import { TicketBody, TicketStub, ticketClass } from '../ui/Ticket';
import { GAME_NAME_KEY } from './playApi';

/**
 * A lobby's join code as an upright ticket (ui/Ticket.tsx), the same for every game's lobby; friends type it in
 * Games → Join with a code (play/JoinCode.tsx), and friends on Hevalo are asked with "Invite friends" beside it. Its
 * tiles arrive one by one the first time, and a light crosses them now and then while in front, never under reduced
 * motion. Copy, or a tap on the code, copies it. Share sends one message, a sentence with the code then its link
 * (shared join-link.ts), which a message shows as the game's card; without a share sheet it is copied. A lobby that can
 * no longer be joined has no code, and no ticket.
 */

/** What Share sends for each game. */
const SHARE_KEY: Record<PlayGame, MessageKey> = {
  'wordle-battle': 'play.code.shareBattle',
  'rhyme-match': 'play.code.shareRhymeMatch',
  stories: 'play.code.shareStories',
  'last-letter': 'play.code.shareLastLetter',
  impostor: 'play.code.shareImpostor',
  'who-am-i': 'games.whoAmI.share',
};

/** How long Copy shows its tick, and how long a note stays up. */
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
  /** Null once the lobby can no longer be joined. */
  code: string | null | undefined;
  /** Who may join with it, which the hint under it says. */
  access?: GameAccess;
  /** "Invite friends" for the host: beside Copy and Share, or alone when there is no code. */
  invite?: React.ReactNode;
}): React.JSX.Element | null {
  const t = useT();
  const { user } = useAuth();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const inFront = useInFront(ref);
  const [still] = useState(prefersReducedMotion);
  // A count rather than a flag, so every copy replays its burst.
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
    const said = t(SHARE_KEY[game], { code: formatJoinCode(shown) });
  // The link says who is asking, so someone who is not a friend yet can ask to be one.
    const url = buildJoinLink(game, shown, { from: user?.id, origin: window.location.origin });
    // One message with the link last, where a receiving app draws it as the game's card; a link passed separately is
    // placed anywhere, or dropped.
    const text = url ? `${said}\n${t('play.code.shareTap')} ${url}` : said;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t(GAME_NAME_KEY[game]), text });
        return;
      } catch (e) {
        // Closing the share sheet is not an error; a sheet that would not open falls back to copying.
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
        {/* The code itself copies too: it is where the eye and thumb go first. */}
        <button
          type="button"
          className="code-ticket-code"
          dir="ltr"
          onClick={() => void copy()}
          // Read out one character at a time: "A B C 2 3 4".
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
            {/* Both words hold the button's width, so "Copied!" moves nothing beside it. */}
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
      {/* The toast, announced as it appears and gone on its own. */}
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
