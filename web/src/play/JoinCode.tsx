import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  parseInvite,
  type JoinedByCode,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { useT } from '../i18n/I18nProvider';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import { codeFromTyping, joinCodeError } from './joinCode';
import { joinPath, lobbyPath } from './playApi';

/**
 * Joining any game by its code: the Games hub's "Join with a code" (a card
 * that opens a sheet), and the same boxes inline where a page has room for
 * them (the Stories library). One way in for all three games, because one
 * code reaches any of them (`POST /play/join`).
 *
 * Six boxes, and behind them ONE real text field that does the work: paste,
 * autofill, an input method, a screen reader and an Arabic-script keyboard
 * all meet an ordinary input with a label, and the boxes only draw what it
 * holds (they are hidden from assistive technology). The field upper-cases
 * what is typed and drops what cannot be in a code; an old invite link pasted
 * into it still opens its lobby. The sixth character joins on its own, and
 * Join is there for whoever reaches for a button.
 *
 * Every state shows on the boxes: each character pops in, the box being
 * filled has a caret; joining runs a wave across them; getting in turns them
 * green one after another with a handful of flecks before the lobby opens;
 * a refusal shakes them once in red, with a sentence that says what to do,
 * and the next keystroke clears it. Under Reduce Motion only the colours
 * change, at once.
 */

/** How long getting in is shown before the lobby opens: the boxes turning, and the flecks falling. */
const JOINED_MS = 1250;
/** The same moment, still: long enough to see the boxes have turned green. */
const JOINED_STILL_MS = 450;

type Phase = 'idle' | 'joining' | 'joined' | 'error';

export function JoinCodeForm({
  autoFocus = false,
  labelHidden = false,
  inline = false,
  onJoined,
}: {
  autoFocus?: boolean;
  /** inside a sheet whose title already says it, the label is for the ear only */
  labelHidden?: boolean;
  /** in a page's own panel: lined up with the words above it, Join beside the boxes */
  inline?: boolean;
  /** called just before the lobby opens (the sheet closes itself) */
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
  // each refusal shakes the boxes anew, and from which box the characters are new (they pop in)
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
    // after the sheet around the field has taken the focus for itself, as it does when it opens
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
    // an account that has not answered the birth month question: the app asks it now, as for any game
    if (res.error.code === 'BIRTH_DATE_REQUIRED') void refreshUser();
    refuse(joinCodeError(res.error, t));
  }

  function change(raw: string): void {
    if (busy) return;
    // an invite link from before codes, pasted whole: it still opens its lobby
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

  // the box being filled (the last one once all six are), which shows where the focus is; the caret only while there is room
  const active = Math.min(code.length, JOIN_CODE_LENGTH - 1);
  const caret = code.length < JOIN_CODE_LENGTH;
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
      {/* a code reads left to right in every language; the words around it follow the page */}
      <div className="code-entry-field" dir="ltr">
        <input
          ref={inputRef}
          id={inputId}
          className="code-entry-input"
          value={code}
          onChange={(e) => change(e.target.value)}
          // the boxes are filled from the left, so the caret always sits after the last character
          onSelect={(e) => {
            const el = e.currentTarget;
            if (el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          readOnly={busy}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={phase === 'error' ? true : undefined}
          aria-describedby={message ? messageId : undefined}
        />
        <span className="code-boxes" key={refusals} aria-hidden="true">
          {Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => {
            const ch = code[i];
            return (
              <Fragment key={i}>
                {i === JOIN_CODE_LENGTH / 2 && <span className="code-boxes-gap" />}
                <span
                  className={`code-box${ch ? ' is-filled' : ''}${i === active ? ' is-active' : ''}`}
                  style={{ '--i': i } as CSSProperties}
                >
                  {ch && (
                    <span
                      key={ch}
                      className={`code-box-char${i >= fresh ? ' is-fresh' : ''}`}
                      style={{ '--n': Math.max(0, i - fresh) } as CSSProperties}
                    >
                      {ch}
                    </span>
                  )}
                  {i === active && caret && <span className="code-box-caret" />}
                </span>
              </Fragment>
            );
          })}
        </span>
        {phase === 'joined' && !still && <JoinedBurst />}
      </div>
      <div className="code-entry-foot">
        {/* the line is kept while empty, so a refusal does not move Join; the alert is only there with something to say */}
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

/**
 * The handful of flecks thrown when a code gets you in: the celebration's own
 * (shared celebration.ts, ranks/Celebration.tsx), smaller — a nod, not a
 * prize — and thrown as the last box turns.
 */
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
 * The ticket on the Games hub's card and at the top of the sheet: the outline
 * both apps share (a stub, a tear line with a notch at each end, three tiles
 * for the code), drawn flat in the sun's gold from the palette so it follows
 * the light and the dark scheme. The stub takes the stronger tint, as the
 * stub of every ticket in the app does; a right-to-left page mirrors it.
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
 * The sheet "Join with a code" opens. Joining needs an account, as every game
 * does; a visitor is told so here and offered the two ways in, and comes back
 * to this sheet after signing in (`?join` on the Games hub opens it).
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

/**
 * The Games hub's way in by code: a card as wide as the page, with the
 * ticket on it, that opens the sheet. Coming back from signing in with
 * `?join` opens the sheet again, and the address forgets it once it has.
 */
export function JoinCodeEntry(): React.JSX.Element {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(() => params.has('join'));
  useEffect(() => {
    if (!params.has('join')) return;
    const next = new URLSearchParams(params);
    next.delete('join');
    setParams(next, { replace: true });
  }, []); // once, as the page opens

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
