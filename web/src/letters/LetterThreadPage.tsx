import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LETTERS_CHANGED, type LetterItem, type LetterThread } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useMemoryOwner } from '../lib/useApi';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { ErrorState } from '../components/states';
import { ChevronIcon } from '../components/icons';
import { UserActions } from '../profile/UserActions';
import { ReportSheet } from '../reports/ReportSheet';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import { BirdBadge, LetterSheet } from './LetterParts';
import { LetterComposer, type LetterToSend } from './LetterComposer';
import { letterErrorText } from './errors';
import { rememberedPaper } from './paper';
import { keepDraft, threadDraft } from './drafts';
import './letters.css';

/** Coming back to the tab reads the correspondence again, but not more often than this. */
const VISIBLE_GAP_MS = 5000;

/**
 * The correspondence as last read, and the way to read it again. It is read
 * fresh each time, never from memory, since whose turn it is must be what the
 * server says now; but a read that fails because the network or the server
 * did leaves the letters on the page (and the paper with what is on it),
 * rather than putting an error in their place. A refusal (the letters ended
 * by a block, an account held back) is said, since there is nothing to show.
 */
function useCorrespondence(threadId: string): { data: LetterThread | null; error: string | null; reload: () => void } {
  const t = useT();
  const { client } = useAuth();
  const [state, setState] = useState<{ data: LetterThread | null; error: string | null }>({ data: null, error: null });
  const [asked, setAsked] = useState(0);
  const reload = useCallback(() => setAsked((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    // asked again after an error with nothing to show: the page waits for the answer rather than showing the old error
    setState((s) => (s.data || !s.error ? s : { data: null, error: null }));
    void client.get<LetterThread>(`/letters/threads/${encodeURIComponent(threadId)}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ data: res.data, error: null });
      else
        setState((s) => (s.data && (res.error.kind === 'network' || res.error.kind === 'server' || res.error.kind === 'rate_limited') ? s : { data: null, error: describeError(res.error, t) }));
    });
    // only the newest read counts: one asked before it never lands on top of it
    return () => {
      cancelled = true;
    };
  }, [client, threadId, asked, t]);
  return { ...state, reload };
}

/**
 * One correspondence (/app/letters/:threadId): every letter, oldest first,
 * each on its own sheet, and at the foot either the paper to write back on —
 * when their letter is the last — or a line saying your bird is with them.
 *
 * The pen pal's ⋯ holds what ends things, plainly named: report them, block
 * them, and say goodbye (asked twice), which closes the letters for both. A
 * letter written to you can be reported on its own, from under it.
 *
 * It is read again when the server says something changed in your letters
 * and when the tab is shown again, so their next letter appears here while
 * it is open (it still lands at your window once, as every letter does). A
 * letter being written back is kept as it is written (letters/drafts.ts).
 */
export function LetterThreadPage(): React.JSX.Element {
  const { threadId = '' } = useParams();
  // each correspondence is its own page: the letter just sent to one, or the paper being written to them, never
  // carries over to another reached by going back or forward from it
  return <Correspondence key={threadId} threadId={threadId} />;
}

function Correspondence({ threadId }: { threadId: string }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const thread = useCorrespondence(threadId);
  const who = useMemoryOwner();
  useRealtimeEvent(LETTERS_CHANGED, thread.reload);
  const shownAt = useRef(Date.now());
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || Date.now() - shownAt.current < VISIBLE_GAP_MS) return;
      shownAt.current = Date.now();
      thread.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [thread.reload]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<LetterItem | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  // a letter sent is shown at once; the paper only comes back with their answer
  const [paperKey, setPaperKey] = useState(0);

  const data = thread.data;
  if (thread.error && !data) return <ErrorState message={thread.error} onRetry={thread.reload} />;
  if (!data) return <div className="container letters-page" aria-busy="true" />;

  // a letter just sent shows at once, until a read of the correspondence has it; from then on the server says whose turn it is
  const pending = sent && !data.letters.some((l) => l.id === sent.id) ? sent : null;
  const letters = pending ? [...data.letters, pending] : data.letters;
  const yourTurn = data.yourTurn && !pending;
  const name = data.person.name;
  // you write back on the paper you last wrote to them on, or else the one you last wrote on anywhere
  const lastOwn = [...letters].reverse().find((l) => l.mine && !l.removed && l.decor);

  async function reply(letter: LetterToSend): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<{ letter: LetterItem }>(`/letters/threads/${encodeURIComponent(threadId)}`, letter);
    setBusy(false);
    if (!res.ok) {
      setError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      // refused because their letter is not the last any more, or the letters ended meanwhile: the page read again
      // says so, and what is on the paper is kept for when it is your turn
      if (res.error.kind === 'client') thread.reload();
      return;
    }
    keepDraft(who, threadDraft(threadId), null);
    setSent(res.data.letter);
    setPaperKey((k) => k + 1);
  }

  async function goodbye(): Promise<void> {
    const res = await client.post(`/letters/threads/${encodeURIComponent(threadId)}/end`);
    if (res.ok) navigate('/app/letters');
  }

  return (
    <div className="container letters-page">
      <Link to="/app/letters" className="letters-back">
        <ChevronIcon size={16} className="letters-back-icon flip-rtl" />
        {t('letters.title')}
      </Link>
      <header className="letters-thread-head">
        <BirdBadge bird={data.person.bird} size={52} />
        <h1 className="letters-thread-name">{name}</h1>
        <UserActions
          userId={data.person.id}
          name={name}
          onBlocked={() => navigate('/app/letters')}
          remove={data.closed ? undefined : { label: t('letters.goodbye'), title: t('letters.goodbye.title', { name }), onConfirm: goodbye }}
          className="letters-thread-menu"
        />
      </header>

      <ol className="letters-list">
        {letters.map((l) => (
          <li key={l.id}>
            <LetterSheet letter={l} from={l.mine ? t('letters.you') : name} onReport={l.mine ? undefined : () => setReporting(l.id)} />
          </li>
        ))}
      </ol>

      {data.closed ? (
        <p className="letters-note">{t('letters.thread.closed')}</p>
      ) : yourTurn ? (
        <LetterComposer
          key={paperKey}
          label={t('letters.writeBack', { name })}
          paper={lastOwn?.decor?.paper ?? rememberedPaper(who)}
          canDraw
          draft={threadDraft(threadId)}
          busy={busy}
          onSend={(letter) => void reply(letter)}
          error={error}
        />
      ) : (
        <p className="letters-note" role="status">
          {t('letters.thread.waiting', { name })}
        </p>
      )}

      <ReportSheet
        open={reporting !== null}
        onClose={() => setReporting(null)}
        target={{ targetType: 'letter', targetId: reporting ?? '' }}
        block={{ userId: data.person.id, name }}
        onBlocked={() => navigate('/app/letters')}
      />
    </div>
  );
}
