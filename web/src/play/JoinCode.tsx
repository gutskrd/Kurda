import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BURST,
  JOIN_CODE_LENGTH,
  TICKET_ART_BOX,
  TICKET_ART_OUTLINE,
  TICKET_ART_PERFORATION,
  TICKET_ART_STUB,
  TICKET_ART_TILES,
  burstPlan,
  isPlayGame,
  parseInvite,
  type JoinedByCode,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CodeBoxes } from '../components/CodeBoxes';
import { Sheet } from '../components/Sheet';
import { useT } from '../i18n/I18nProvider';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import { codeFromTyping, joinCodeError } from './joinCode';
import { joinPath, lobbyPath } from './playApi';

/**
 * Joining any game by its code (`POST /play/join`): the Games hub's "Join with a code" sheet, or inline where a page has
 * room (the Stories library). Six boxes over one text field (components/CodeBoxes.tsx) that upper-cases and drops what
 * cannot be in a code; a pasted old invite link still opens its lobby. The sixth character joins by itself. The boxes
 * show each state: typing, a wave while joining, green with flecks on success, a red shake on refusal with what to do.
 * Under reduced motion only the colours change.
 */

/** How long getting in shows before the lobby opens. */
const JOINED_MS = 1250;
/** The same, under reduced motion: long enough to see the boxes turn green. */
const JOINED_STILL_MS = 450;

type Phase = 'idle' | 'joining' | 'joined' | 'error';

export function JoinCodeForm({
  autoFocus = false,
  labelHidden = false,
  inline = false,
  onJoined,
}: {
  autoFocus?: boolean;
  /** Inside a sheet whose title says it already, the label is for screen readers only. */
  labelHidden?: boolean;
  /** In a page's own panel: aligned with the words above, Join beside the boxes. */
  inline?: boolean;
  /** Called just before the lobby opens (the sheet closes itself). */
  onJoined?: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client, refreshUser } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  // Each refusal shakes the boxes anew; `fresh` marks where new characters pop in.
  const [refusals, setRefusals] = useState(0);
  const [fresh, setFresh] = useState(0);
  const [focused, setFocused] = useState(false);
  const [said, setSaid] = useState('');
  const [still] = useState(prefersReducedMotion);
  const leaving = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const busy = phase === 'joining' || phase === 'joined';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(leaving.current);
    };
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    // After the sheet around the field has taken focus, as it does when it opens.
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  function refuse(text: string): void {
    setPhase('error');
    setMessage(text);
    setRefusals((n) => n + 1);
    setFresh(JOIN_CODE_LENGTH);
    haptic('wrong');
  }

  async function join(value: string): Promise<void> {
    if (busy) return;
    if (value.length !== JOIN_CODE_LENGTH) {
      refuse(t('play.join.invalid'));
      return;
    }
    setPhase('joining');
    setMessage(null);
    const res = await client.post<JoinedByCode>('/play/join', { code: value });
    if (!mounted.current) return;
    // A code can only lead to a game this app has a page for.
    if (res.ok && !isPlayGame(res.data.game)) {
      refuse(t('play.join.notFound'));
      return;
    }
    if (res.ok) {
      setPhase('joined');
      setFresh(JOIN_CODE_LENGTH);
      setSaid(t('play.join.joined'));
      haptic('correct');
      const where = lobbyPath(res.data.game, res.data.lobbyId);
      leaving.current = window.setTimeout(() => {
        onJoined?.();
        navigate(where);
      }, still ? JOINED_STILL_MS : JOINED_MS);
      return;
    }
    // An account without a birth month is asked now, as for any game.
    if (res.error.code === 'BIRTH_DATE_REQUIRED') void refreshUser();
    refuse(joinCodeError(res.error, t));
  }

  function change(raw: string): void {
    if (busy) return;
    // An invite link from before codes, pasted whole, still opens its lobby.
    const invite = parseInvite(raw);
    if (invite) {
      onJoined?.();
      navigate(joinPath(invite.type, invite.id));
      return;
    }
    const next = codeFromTyping(raw);
    setFresh(next.startsWith(code) ? code.length : 0);
    setCode(next);
    if (phase === 'error') {
      setPhase('idle');
      setMessage(null);
    }
    if (next.length === JOIN_CODE_LENGTH && next !== code) void join(next);
  }

  const inputId = `${id}-code`;
  const messageId = `${id}-message`;

  return (
    <form
      className={`code-entry is-${phase}${inline ? ' is-inline' : ''}${still ? ' is-still' : ''}${focused ? ' is-focused' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void join(code);
      }}
      noValidate
    >
      <label htmlFor={inputId} className={labelHidden ? 'sr-only' : 'code-entry-label'}>
        {t('play.join.title')}
      </label>
      <CodeBoxes
        inputRef={inputRef}
        id={inputId}
        value={code}
        length={JOIN_CODE_LENGTH}
        fresh={fresh}
        shakes={refusals}
        onChange={(e) => change(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        readOnly={busy}
        autoCapitalize="characters"
        autoComplete="off"
        enterKeyHint="go"
        aria-invalid={phase === 'error' ? true : undefined}
        aria-describedby={message ? messageId : undefined}
      >
        {phase === 'joined' && !still && <JoinedBurst />}
      </CodeBoxes>
      <div className="code-entry-foot">
        {/* The line stays while empty so a refusal does not move Join; the alert appears only with something to say. */}
        <p className="code-entry-message">
          {message && (
            <span id={messageId} role="alert">
              {message}
            </span>
          )}
        </p>
        <Button type="submit" disabled={busy}>
          {phase === 'joining' ? t('games.joining') : phase === 'joined' ? t('play.join.joined') : t('play.join.go')}
        </Button>
      </div>
      <p className="sr-only" role="status">
        {said}
      </p>
    </form>
  );
}

/** The flecks when a code gets you in: the celebration's own (shared celebration.ts), smaller, as the last box turns. */
function JoinedBurst(): React.JSX.Element {
  const flecks = useMemo(() => burstPlan(BURST.lesson, 23, 3, 120), []);
  const burstMs = 950;
  return (
    <span className="code-entry-burst" aria-hidden="true">
      {flecks.map((f, i) => (
        <span
          key={i}
          className={`celebrate-fleck c${f.colour}`}
          style={
            {
              '--dx': `${f.dx}px`,
              '--dy': `${f.dy}px`,
              '--fall': `${f.fall}px`,
              '--spin': `${f.spin}deg`,
              width: f.w,
              height: f.h,
              animationDelay: `${260 + Math.round(f.start * burstMs)}ms`,
              animationDuration: `${Math.round((f.end - f.start) * burstMs)}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/**
 * The ticket on the Games hub's card and atop the sheet, in both apps' shared outline, flat in the palette's gold so it
 * follows the scheme; mirrored on a right-to-left page.
 */
export function TicketArt({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={`ticket-art${className ? ` ${className}` : ''}`}
      viewBox={`-3 -6 ${TICKET_ART_BOX.width + 6} ${TICKET_ART_BOX.height + 12}`}
      width="64"
      height="44"
      aria-hidden="true"
      focusable="false"
    >
      <path className="ticket-art-body" d={TICKET_ART_OUTLINE} />
      <path className="ticket-art-stub" d={TICKET_ART_STUB} />
      <path className="ticket-art-perf" d={TICKET_ART_PERFORATION} />
      {TICKET_ART_TILES.map((tile) => (
        <rect key={tile.x} className="ticket-art-tile" x={tile.x} y={tile.y} width={tile.width} height={tile.height} rx={tile.r} />
      ))}
      <path className="ticket-art-edge" d={TICKET_ART_OUTLINE} />
    </svg>
  );
}

/**
 * The sheet "Join with a code" opens. A visitor is offered sign-up and sign-in, and returns to this sheet after
 * (`?join` on the Games hub opens it).
 */
export function JoinCodeSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const from = '/app/games?join=1';
  return (
    <Sheet open={open} onClose={onClose} label={t('play.join.title')} className="code-sheet">
      <div className="code-sheet-head">
        <TicketArt />
        <h2 className="code-sheet-title">{t('play.join.title')}</h2>
        <p className="code-sheet-sub">{signedIn ? t('play.join.sheetBody') : t('gate.body', { what: t('gate.what.playOthers') })}</p>
      </div>
      {signedIn ? (
        <JoinCodeForm autoFocus labelHidden onJoined={onClose} />
      ) : (
        <div className="code-sheet-gate">
          <Link to="/register" className="btn btn-primary" state={{ from }}>
            {t('auth.login.createAccount')}
          </Link>
          <Link to="/login" className="btn btn-secondary" state={{ from }}>
            {t('nav.login')}
          </Link>
        </div>
      )}
    </Sheet>
  );
}

/** The Games hub's full-width card that opens the sheet; returning with `?join` reopens it, and the address drops it. */
export function JoinCodeEntry(): React.JSX.Element {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(() => params.has('join'));
  useEffect(() => {
    if (!params.has('join')) return;
    const next = new URLSearchParams(params);
    next.delete('join');
    setParams(next, { replace: true });
  }, []); // Once, as the page opens.

  return (
    <>
      <button type="button" className="join-code-card" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <TicketArt className="join-code-card-art" />
        <span className="join-code-card-text">
          <span className="join-code-card-title">{t('play.join.title')}</span>
          <span className="join-code-card-sub">{t('play.join.cardBody')}</span>
        </span>
        <span className="join-code-card-go" aria-hidden="true">
          {t('play.join.cardAction')}
        </span>
      </button>
      <JoinCodeSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
