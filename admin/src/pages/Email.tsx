import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import {
  Badge,
  Banner,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  Loading,
  PageHeader,
  Section,
  Tabs,
  Textarea,
  Time,
  errorLine,
  useLoad,
  useToast,
} from '../ui';
import './email.css';

/** How email is set up, as `GET /admin/email/status` says. */
export interface EmailStatus {
  provider: 'resend' | 'smtp' | 'none';
  from: string;
  replyTo: string | null;
  supportFrom: string;
  inbox: { webhook: boolean; canReadBodies: boolean; unread: number };
  /** null when the API runs without a job queue (no Redis) */
  failures: { count: number; lastError: string | null; lastAt: string | null } | null;
}

export interface SupportEmailSummary {
  id: string;
  from: { address: string; name: string | null };
  to: string[];
  subject: string;
  preview: string | null;
  receivedAt: string;
  readAt: string | null;
  archivedAt: string | null;
  replies: number;
  attachments: number;
}

export interface SupportEmail extends SupportEmailSummary {
  cc: string[];
  text: string | null;
  html: string | null;
  attachmentList: Array<{ id: string | null; filename: string | null; contentType: string | null; size: number | null }>;
  bodyAvailable: boolean;
  answers: Array<{ id: string; body: string; sentAt: string; admin: { id: string; username: string } | null }>;
}

const PROVIDER_NAME: Readonly<Record<EmailStatus['provider'], string>> = { resend: 'Resend', smtp: 'SMTP', none: 'None' };

type Box = 'inbox' | 'archived';

/**
 * A received HTML body, shown without letting it do anything: a sandbox with
 * no permissions (no scripts, no forms, its own origin) and a policy that
 * loads nothing from outside — a remote image in a mail is how a sender learns
 * it was opened. Plain text is shown first whenever the mail has it.
 */
export function htmlFrameDoc(html: string): string {
  const policy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><base target="_blank"><style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:12px;word-break:break-word;color:#14171c;background:#fff}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}

/**
 * Email (#/email): how the app's email is set up and whether it is getting
 * out — with a test send to yourself — and the support inbox, where mail to
 * the support address is read and answered.
 *
 * The settings half is for admins; support sees the inbox only (the API
 * refuses them the settings, and the page simply leaves that half out).
 */
export function Email(): React.JSX.Element {
  const [box, setBox] = useState<Box>('inbox');
  const status = useLoad(
    () => api<EmailStatus>('/admin/email/status').catch((err: unknown) => (err instanceof ApiError && err.status === 403 ? null : Promise.reject(err))),
    [],
  );
  const list = useLoad(() => api<{ emails: SupportEmailSummary[]; unread: number }>(`/admin/support/emails${box === 'archived' ? '?archived=true' : ''}`), [box]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Email"
        subtitle="How Hevalo's email is sent, and the support inbox."
        actions={
          <Button
            icon="refresh"
            onClick={() => {
              void status.reload();
              void list.reload();
            }}
            busy={list.loading && !!list.data}
          >
            Refresh
          </Button>
        }
      />

      {status.data && <SendingPanel status={status.data} />}
      {status.error != null && <ErrorState error={status.error} onRetry={() => void status.reload()} what="the email settings" compact />}

      <Section title="Support inbox" description={status.data ? `Mail sent to ${addressOf(status.data.supportFrom)}.` : 'Mail sent to the support address.'} flush>
        {status.data && !status.data.inbox.webhook && (
          <Banner tone="warn" title="The inbox is not connected yet">
            Mail to the support address does not reach this page until Resend receives it (an MX record on the domain) and sends it here
            (a webhook to /webhooks/resend, with its secret set as RESEND_WEBHOOK_SECRET). See docs/auth/email-delivery.md.
          </Banner>
        )}
        <Tabs
          label="Show"
          value={box}
          onChange={setBox}
          items={[
            { key: 'inbox', label: 'Inbox', count: list.data && box === 'inbox' ? list.data.unread : undefined },
            { key: 'archived', label: 'Archived' },
          ]}
        />
        {list.error != null && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.reload()} what="the support inbox" />
        ) : !list.data ? (
          <Loading rows={3} label="Loading the inbox…" />
        ) : list.data.emails.length === 0 ? (
          <EmptyState title={box === 'inbox' ? 'No mail' : 'Nothing archived'} icon="inbox" compact>
            {box === 'inbox' ? 'Mail sent to the support address arrives here.' : 'Archived mail is kept here.'}
          </EmptyState>
        ) : (
          <ul className="mail-list" aria-label={box === 'inbox' ? 'Inbox' : 'Archived mail'}>
            {list.data.emails.map((m) => (
              <li key={m.id}>
                <button type="button" className={`mail-row${m.readAt ? '' : ' is-unread'}`} onClick={() => setOpenId(m.id)}>
                  <span className="mail-row-top">
                    <span className="mail-from">
                      {/* the dot and the bold are for the eye; a screen reader is told in words (a label on a plain span is not read) */}
                      {!m.readAt && (
                        <>
                          <span className="mail-dot" aria-hidden="true" />
                          <span className="sr-only">Unread: </span>
                        </>
                      )}
                      {m.from.name ?? m.from.address}
                    </span>
                    <span className="mail-when">
                      <Time value={m.receivedAt} />
                    </span>
                  </span>
                  <span className="mail-subject">{m.subject || '(no subject)'}</span>
                  {m.preview && <span className="mail-preview">{m.preview}</span>}
                  {(m.replies > 0 || m.attachments > 0) && (
                    <span className="mail-meta">
                      {m.replies > 0 && <Badge tone="ok">{m.replies === 1 ? 'Answered' : `Answered ×${m.replies}`}</Badge>}
                      {m.attachments > 0 && <Badge>{m.attachments === 1 ? '1 file' : `${m.attachments} files`}</Badge>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <MailDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          void list.reload();
          void status.reload();
        }}
      />
    </div>
  );
}

const addressOf = (from: string): string => /<([^<>]+)>/.exec(from)?.[1] ?? from;

/** Who sends, from where, answers to where, and whether it is getting out this week. */
function SendingPanel({ status }: { status: EmailStatus }): React.JSX.Element {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const failed = status.failures?.count ?? 0;

  async function sendTest(): Promise<void> {
    setSending(true);
    try {
      const res = await api<{ sent: true; to: string }>('/admin/email/test', { method: 'POST', body: {} });
      toast.success(`Sent a test email to ${res.to}. It should arrive within a minute.`);
    } catch (err) {
      toast.error(err instanceof ApiError && err.code === 'EMAIL_NOT_SENT' ? `Not sent. The provider said: ${err.message}` : errorLine(err, 'the test email'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Section
      title="Sending"
      description="Verification codes, password resets and every other email the app sends."
      actions={
        <Button icon="upload" onClick={() => void sendTest()} busy={sending} disabled={status.provider === 'none'}>
          Send a test email to me
        </Button>
      }
    >
      {status.provider === 'none' && (
        <Banner tone="bad" title="Email is not set up">
          Nothing is sent: verification codes and password resets never arrive. Set RESEND_API_KEY on the API.
        </Banner>
      )}
      {failed > 0 && (
        <Banner tone="bad" title={failed === 1 ? '1 email could not be sent this week' : `${failed} emails could not be sent this week`}>
          {status.failures?.lastError && (
            <>
              The last one{status.failures.lastAt && (
                <>
                  , <Time value={status.failures.lastAt} />
                </>
              )}
              : <code className="mail-error">{status.failures.lastError}</code>
            </>
          )}
        </Banner>
      )}
      <dl className="mail-settings">
        <div>
          <dt>Sent with</dt>
          <dd>{PROVIDER_NAME[status.provider]}</dd>
        </div>
        <div>
          <dt>From</dt>
          <dd>{status.from}</dd>
        </div>
        <div>
          <dt>Answers go to</dt>
          <dd>{status.replyTo ?? <span className="subtle">Nowhere (the no-reply address)</span>}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd>
            {status.failures === null ? (
              <span className="subtle">Unknown (no job queue)</span>
            ) : failed === 0 ? (
              <Badge tone="ok">Every email went out</Badge>
            ) : (
              <Badge tone="bad">{failed} failed</Badge>
            )}
          </dd>
        </div>
      </dl>
    </Section>
  );
}

/** One mail: read it, answer it, archive it. A full-screen sheet on a phone (the kit's drawer). */
function MailDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }): React.JSX.Element {
  const toast = useToast();
  const mail = useLoad(async () => (id ? api<SupportEmail>(`/admin/support/emails/${id}/open`, { method: 'POST', body: {} }) : null), [id]);
  const [answer, setAnswer] = useState('');
  // said when "Send answer" is pressed with nothing written, and gone once something is
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'send' | 'archive' | 'unread' | null>(null);
  const m = mail.data;

  // the list's unread dot goes once the mail is opened
  const openedId = m?.id;
  useEffect(() => {
    if (openedId) onChanged();
    // once per mail opened, not on every change of the parent's callback
  }, [openedId]);

  async function act(kind: 'archive' | 'unread', run: () => Promise<unknown>, done: string): Promise<void> {
    setBusy(kind);
    try {
      await run();
      toast.success(done);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(errorLine(err, 'the email'));
    } finally {
      setBusy(null);
    }
  }

  async function send(): Promise<void> {
    if (!m) return;
    if (!answer.trim()) {
      setAnswerError('Write the answer first.');
      return;
    }
    setBusy('send');
    try {
      await api(`/admin/support/emails/${m.id}/reply`, { method: 'POST', body: { body: answer.trim() } });
      toast.success(`Answer sent to ${m.from.address}.`);
      setAnswer('');
      onChanged();
      void mail.reload();
    } catch (err) {
      toast.error(err instanceof ApiError && err.code === 'REPLY_NOT_SENT' ? err.message : errorLine(err, 'the answer'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      title={m ? m.subject || '(no subject)' : 'Email'}
      className="mail-drawer"
      footer={
        m && (
          <div className="mail-actions">
            <Button
              icon="inbox"
              busy={busy === 'archive'}
              onClick={() =>
                void act(
                  'archive',
                  () => api(`/admin/support/emails/${m.id}/archive`, { method: 'POST', body: { value: !m.archivedAt } }),
                  m.archivedAt ? 'Back in the inbox.' : 'Archived.',
                )
              }
            >
              {m.archivedAt ? 'Move to inbox' : 'Archive'}
            </Button>
            <Button
              variant="ghost"
              busy={busy === 'unread'}
              onClick={() => void act('unread', () => api(`/admin/support/emails/${m.id}/read`, { method: 'POST', body: { value: false } }), 'Marked unread.')}
            >
              Mark unread
            </Button>
          </div>
        )
      }
    >
      {mail.error != null ? (
        <ErrorState error={mail.error} onRetry={() => void mail.reload()} what="this email" compact />
      ) : !m ? (
        <Loading rows={4} label="Opening…" />
      ) : (
        <article className="mail">
          <header className="mail-head">
            <p>
              <strong>{m.from.name ?? m.from.address}</strong>
              {m.from.name && <span className="subtle"> &lt;{m.from.address}&gt;</span>}
            </p>
            <p className="subtle">
              To {m.to.join(', ')}
              {m.cc.length > 0 && `, cc ${m.cc.join(', ')}`} · <Time value={m.receivedAt} />
            </p>
          </header>

          {!m.bodyAvailable ? (
            <Banner tone="info" title="The text of this email is in Resend">
              It could not be read here: the API needs a Resend key that may read received mail (RESEND_INBOX_API_KEY, full access). Open it in
              Resend → Emails → Receiving.
            </Banner>
          ) : m.text ? (
            <div className="mail-body">{m.text}</div>
          ) : m.html ? (
            <iframe className="mail-html" title="The email" sandbox="" srcDoc={htmlFrameDoc(m.html)} />
          ) : (
            <p className="subtle">This email has no text.</p>
          )}

          {m.attachmentList.length > 0 && (
            <div className="mail-files">
              <h3>Files</h3>
              <ul>
                {m.attachmentList.map((a, i) => (
                  <li key={a.id ?? i}>
                    <Icon name="list" size={16} />
                    {/* one run of text, so a long name wraps with its type after it rather than beside it */}
                    <span>
                      {a.filename ?? 'A file'}
                      {a.contentType && <span className="subtle"> · {a.contentType}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="subtle">Files stay in Resend (Emails → Receiving), where they can be opened.</p>
            </div>
          )}

          {m.answers.length > 0 && (
            <div className="mail-answers">
              <h3>Answered</h3>
              {m.answers.map((a) => (
                <div key={a.id} className="mail-answer">
                  <p className="subtle">
                    {a.admin ? a.admin.username : 'An admin'} · <Time value={a.sentAt} />
                  </p>
                  <div className="mail-body">{a.body}</div>
                </div>
              ))}
            </div>
          )}

          <form
            className="mail-reply"
            onSubmit={(e) => {
              e.preventDefault();
              // nothing written: back to the box, whose error now says so
              if (!answer.trim()) e.currentTarget.querySelector('textarea')?.focus();
              void send();
            }}
          >
            <Textarea
              label={`Answer ${m.from.name ?? m.from.address}`}
              hint="Sent from the support address, with their email quoted under it."
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                if (e.target.value.trim()) setAnswerError(null);
              }}
              error={answerError}
              rows={6}
              maxLength={20_000}
            />
            <Button type="submit" variant="primary" busy={busy === 'send'}>
              Send answer
            </Button>
          </form>
        </article>
      )}
    </Drawer>
  );
}
