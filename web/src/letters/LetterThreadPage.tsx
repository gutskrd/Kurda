import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LetterItem, LetterThread } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { ErrorState } from '../components/states';
import { ChevronIcon } from '../components/icons';
import { UserActions } from '../profile/UserActions';
import { ReportSheet } from '../reports/ReportSheet';
import { BirdBadge, LetterPaper, LetterSheet } from './LetterParts';
import { letterErrorText } from './errors';
import './letters.css';

/**
 * One correspondence (/app/letters/:threadId): every letter, oldest first,
 * each on its own sheet, and at the foot either the paper to write back on —
 * when their letter is the last — or a line saying your bird is with them.
 *
 * The pen pal's ⋯ holds what ends things, plainly named: report them, block
 * them, and say goodbye (asked twice), which closes the letters for both. A
 * letter written to you can be reported on its own, from under it.
 */
export function LetterThreadPage(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const { threadId = '' } = useParams();
  const thread = useApiGet<LetterThread>(`/letters/threads/${encodeURIComponent(threadId)}`, { fresh: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<LetterItem | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  // a letter sent is shown at once; the paper only comes back with their answer
  const [paperKey, setPaperKey] = useState(0);

  const data = thread.data;
  if (thread.error && !data) return <ErrorState message={thread.error} onRetry={thread.reload} />;
  if (!data) return <div className="container letters-page" aria-busy="true" />;

  const letters = sent && !data.letters.some((l) => l.id === sent.id) ? [...data.letters, sent] : data.letters;
  const yourTurn = data.yourTurn && !sent;
  const name = data.person.name;

  async function reply(body: string): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<{ letter: LetterItem }>(`/letters/threads/${encodeURIComponent(threadId)}`, { body });
    setBusy(false);
    if (!res.ok) {
      setError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      return;
    }
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
        <LetterPaper key={paperKey} label={t('letters.writeBack', { name })} busy={busy} onSend={(body) => void reply(body)} error={error} />
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
