import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, Conversation, DmMessage } from '../lib/types';
import { useProfileModal } from '../profile/ProfileModal';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Button } from '../components/Button';
import { PersonGlyph, ArrowIcon } from '../components/icons';

const CONVO_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;

/** Map moderation/anti-bot server codes to human copy (server stays authoritative). */
function sendError(err: ApiError): string {
  switch (err.code) {
    case 'TRUST_VELOCITY':
      return 'You’re sending messages too fast — please slow down.';
    case 'AUTO_MODERATED':
      return 'Your account has been restricted for spam-like activity.';
    case 'CHAT_MUTED':
      return 'You’re muted from chat.';
    case 'CONTENT_BLOCKED':
      return 'That message was blocked by moderation.';
    case 'NOT_FRIENDS':
      return 'You can only message people you’re friends with.';
    default:
      return describeError(err);
  }
}

export function Messages(): React.JSX.Element {
  const { client } = useAuth();
  const [params] = useSearchParams();
  const activeId = params.get('to');
  const activeName = params.get('name') ?? undefined;

  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const loadConvos = useCallback(async () => {
    const res = await client.get<{ conversations: Conversation[] }>('/chat/conversations');
    if (res.ok) {
      setConvos(res.data.conversations);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error));
    }
  }, [client]);

  useEffect(() => {
    void loadConvos();
    const t = setInterval(() => void loadConvos(), CONVO_POLL_MS);
    return () => clearInterval(t);
  }, [loadConvos]);

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">Peyam · Messages</span>
        <h1 className="page-title">Messages</h1>
      </div>

      <div className={`chat-layout${activeId ? ' has-active' : ''}`}>
        <aside className="chat-list" aria-label="Conversations">
          {error && convos === null ? (
            <ErrorState message={error} onRetry={() => void loadConvos()} />
          ) : convos === null ? (
            <Loading />
          ) : convos.length === 0 ? (
            <EmptyState title="No messages yet" message="Message a friend from their profile to start a conversation." />
          ) : (
            convos.map((c) => (
              <Link
                key={c.userId}
                to={`/app/messages?to=${c.userId}&name=${encodeURIComponent(c.username)}`}
                className={`chat-convo${c.userId === activeId ? ' active' : ''}`}
              >
                <span className="friend-avatar" aria-hidden="true"><PersonGlyph size={22} /></span>
                <span className="chat-convo-body">
                  <span className="chat-convo-top">
                    <span className="chat-convo-name">{c.username}</span>
                    {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
                  </span>
                  <span className="chat-convo-last">
                    {c.lastFromMe ? 'You: ' : ''}
                    {c.lastMessage}
                  </span>
                </span>
              </Link>
            ))
          )}
        </aside>

        <section className="chat-thread-pane">
          {activeId ? (
            <Thread key={activeId} otherId={activeId} otherName={activeName} onSent={() => void loadConvos()} />
          ) : (
            <div className="chat-empty">
              <p className="muted">Select a conversation to start chatting.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({
  otherId,
  otherName,
  onSent,
}: {
  otherId: string;
  otherName?: string;
  onSent: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { openProfile } = useProfileModal();
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await client.get<{ messages: DmMessage[] }>(`/chat/${otherId}/messages`);
    if (res.ok) {
      // history returns newest-first; show oldest→newest
      setMessages([...res.data.messages].reverse());
    } else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error));
    }
  }, [client, otherId]);

  useEffect(() => {
    setMessages(null);
    setLoadError(null);
    void load();
    const t = setInterval(() => void load(), THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendMsg(null);
    const res = await client.post<DmMessage>(`/chat/${otherId}/messages`, { body });
    setSending(false);
    if (res.ok) {
      setText('');
      setMessages((m) => [...(m ?? []), res.data]);
      onSent();
    } else {
      setSendMsg(sendError(res.error));
    }
  }

  return (
    <div className="chat-thread">
      <header className="chat-thread-head">
        <Link to="/app/messages" className="chat-back" aria-label="Back to conversations">
          <ArrowIcon size={18} />
        </Link>
        <button
          type="button"
          className="chat-thread-title"
          onClick={() => openProfile({ kind: 'user', userId: otherId, username: otherName })}
        >
          {otherName ?? 'Conversation'}
        </button>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null ? (
          <Loading />
        ) : messages.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? 'No messages yet. Say hello!'}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`bubble${m.senderId === user?.id ? ' mine' : ''}`}>
              {m.body}
            </div>
          ))
        )}
      </div>

      {sendMsg && <div className="msg msg-error chat-senderr">{sendMsg}</div>}
      <form className="chat-compose" onSubmit={send}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          aria-label="Message"
        />
        <Button type="submit" disabled={sending || text.trim().length === 0}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
