import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_AUDIO_MAX_SECONDS } from '@kurda/shared';
import { api } from '../api';
import {
  conversationHref,
  conversationsIn,
  initialPart,
  lineBefore,
  nextLineFor,
  partProgress,
  playOrder,
  rememberPart,
  rememberedPart,
  shareLink,
  type ConversationRecording,
  type ConversationSummary,
  type LineState,
} from '../conversations';
import { STATUS_NAME } from '../lessons';
import { scriptOf, type Listing } from '../lessonAudio';
import { ClipRecorder, ShortcutHint } from '../recorder';
import { Badge, Button, EmptyState, ErrorState, Icon, Loading, PageHeader, Section, Time, useLoad, useToast } from '../ui';
import { bustUrl } from '../ui/SpeakerPicker';
import { SpeakingPreview } from '../ui/SpeakingPreview';
import { uploadWithVoice } from '../voice';
import { STATUS_TONE } from './Lessons';

/** How often the page asks for the others' takes while it is open and in view. */
const REFRESH_MS = 8000;

/**
 * Record conversations: #/audio/conversations lists every conversation in the
 * lessons, with how far each part has got; #/audio/conversations/<id> is the
 * page one is recorded on, by several people in several places. Each opens it
 * on their own part (the link "Send" gives them), hears the line before each
 * of theirs, and says it; the others' takes appear as they are made.
 */
export function ConversationAudio({ id, lessonId, part }: { id: string | null; lessonId: string | null; part: string | null }): React.JSX.Element {
  return id ? <ConversationStudio key={id} id={id} lessonId={lessonId} partParam={part} /> : <ConversationList />;
}

function ConversationList(): React.JSX.Element {
  const list = useLoad(() => api<Listing>('/admin/lesson-audio'), []);
  const conversations = useMemo(() => (list.data ? conversationsIn(list.data.items) : null), [list.data]);

  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} what="recordings" />;
  if (!conversations) return <Loading rows={4} />;
  if (conversations.length === 0) {
    return (
      <EmptyState title="No conversations yet" icon="chat">
        Add one to a lesson: open the lesson, and under “Add an exercise” choose Conversation. It appears here to be recorded, each part by its own person.{' '}
        <a href="#/lessons">Open the lessons</a>
      </EmptyState>
    );
  }
  return (
    <div className="cv-list">
      {conversations.map((c) => (
        <ConversationCard key={c.id} c={c} />
      ))}
    </div>
  );
}

function ConversationCard({ c }: { c: ConversationSummary }): React.JSX.Element {
  const done = c.recorded === c.total;
  return (
    <article className="card cv-card">
      <header className="cv-card-head">
        <div>
          <h3 className="cv-card-title">
            <a href={conversationHref(c.id, c.lessonId)}>{c.lessonTitle}</a>
          </h3>
          <div className="subtle">{c.where}</div>
        </div>
        <Badge tone={STATUS_TONE[c.lessonStatus]}>{STATUS_NAME[c.lessonStatus]}</Badge>
      </header>
      <ul className="cv-card-parts">
        {c.parts.map((p) => (
          <li key={p.part}>
            <a className="cv-card-part" href={conversationHref(c.id, c.lessonId, p.part)} aria-label={`Record ${p.name}’s part: ${p.recorded} of ${p.total} lines recorded`}>
              {p.character ? <img src={bustUrl(p.character)} width={32} height={32} alt="" /> : <span className="cv-initial">{p.name.slice(0, 1)}</span>}
              <span className="cv-card-name">{p.name}</span>
              <span className="cv-meter" aria-hidden="true">
                <span style={{ width: `${p.total ? (p.recorded / p.total) * 100 : 0}%` }} />
              </span>
              <span className="subtle">
                {p.recorded}/{p.total}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <footer className="cv-card-foot">
        <span className={done ? 'cv-done' : 'subtle'}>{done ? 'Every line is recorded' : `${c.total - c.recorded} of ${c.total} lines still to record`}</span>
        <a className="button-link primary" href={conversationHref(c.id, c.lessonId)}>
          <Icon name="mic" />
          Record
        </a>
      </footer>
    </article>
  );
}

/** One audio element for the page: a line, the line before, or the whole conversation in turn. */
function useLinePlayer(): {
  playing: number | null;
  play: (index: number, url: string) => void;
  playAll: (queue: Array<{ index: number; url: string }>) => void;
  stop: () => void;
} {
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<Array<{ index: number; url: string }>>([]);
  const [playing, setPlaying] = useState<number | null>(null);

  const stop = useCallback(() => {
    queue.current = [];
    audio.current?.pause();
    setPlaying(null);
  }, []);
  useEffect(() => stop, [stop]);

  const next = useCallback(() => {
    const el = (audio.current ??= new Audio());
    const item = queue.current.shift();
    if (!item) {
      setPlaying(null);
      return;
    }
    el.onended = () => next();
    el.onerror = () => next();
    el.src = item.url;
    setPlaying(item.index);
    void el.play().catch(() => {
      queue.current = [];
      setPlaying(null);
    });
  }, []);

  const playAll = useCallback(
    (items: Array<{ index: number; url: string }>) => {
      audio.current?.pause();
      queue.current = [...items];
      next();
    },
    [next],
  );
  const play = useCallback((index: number, url: string) => playAll([{ index, url }]), [playAll]);
  return { playing, play, playAll, stop };
}

function ConversationStudio({ id, lessonId, partParam }: { id: string; lessonId: string | null; partParam: string | null }): React.JSX.Element {
  const toast = useToast();
  const [rec, setRec] = useState<ConversationRecording | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [part, setPart] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const player = useLinePlayer();
  const lineRefs = useRef(new Map<number, HTMLLIElement>());

  const load = useCallback(async (): Promise<ConversationRecording | null> => {
    try {
      const next = await api<ConversationRecording>(`/admin/lesson-audio/conversations/${encodeURIComponent(id)}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ''}`);
      setRec(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err);
      return null;
    }
  }, [id, lessonId]);

  // first load: open on the part asked for (or remembered), at its first line still to record
  useEffect(() => {
    void load().then((first) => {
      if (!first) return;
      const p = initialPart(first, partParam, rememberedPart(id));
      setPart(p);
      setSelected(nextLineFor(first, p, null) ?? first.lines.find((l) => l.part === p)?.index ?? null);
    });
  }, [load, id, partParam]);

  // the others' takes, as they are made: asked for again every few seconds while the page is in view
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => window.clearInterval(tick);
  }, [load]);

  const choosePart = (p: number): void => {
    if (!rec) return;
    setPart(p);
    rememberPart(id, p);
    setSelected(nextLineFor(rec, p, null) ?? rec.lines.find((l) => l.part === p)?.index ?? null);
    // the address says whose page this is, so a reload or a shared link opens the same part
    history.replaceState(null, '', conversationHref(id, rec.lesson.id, p));
  };

  const progress = useMemo(() => (rec ? partProgress(rec) : []), [rec]);

  if (error && !rec) {
    return (
      <div>
        <PageHeader title="Conversation" back={{ href: '#/audio/conversations', label: 'All conversations' }} />
        <ErrorState error={error} onRetry={() => void load()} what="recordings" />
      </div>
    );
  }
  if (!rec || part === null) {
    return (
      <div>
        <PageHeader title="Conversation" back={{ href: '#/audio/conversations', label: 'All conversations' }} />
        <Loading rows={6} />
      </div>
    );
  }

  const { conversation, lesson } = rec;
  const me = conversation.speakers[part]!;
  const mine = progress[part]!;
  const all = playOrder(rec);
  const myLines = rec.lines.filter((l) => l.part === part).map((l) => l.index);

  const send = async (p: number): Promise<void> => {
    const url = shareLink(id, lesson.id, p, location.href);
    const name = conversation.speakers[p]!.name;
    const text = `Record ${name}’s part of “${conversation.title || lesson.titleEn}” in the Hevalo admin:`;
    try {
      // a phone shares to wherever the person is reached (a message, a mail); a computer copies the link
      if (typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches) {
        await navigator.share({ title: `${name}’s part`, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(`Link to ${name}’s part copied. Send it to whoever records ${name}.`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(`The link could not be copied: ${url}`);
    }
  };

  const save = async (line: LineState, wav: Uint8Array): Promise<void> => {
    const text = conversation.lines[line.index]!.text;
    const character = conversation.speakers[line.part]?.character ?? null;
    await uploadWithVoice(`/admin/lesson-audio?text=${encodeURIComponent(text)}&line=${encodeURIComponent(`${id}:${line.part}`)}`, wav, { speaker: character, text });
    const next = await load();
    if (next) {
      const after = nextLineFor(next, line.part, line.index);
      if (after !== null) {
        setSelected(after);
        requestAnimationFrame(() => lineRefs.current.get(after)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      } else {
        toast.success(`Every one of ${conversation.speakers[line.part]!.name}’s lines is recorded.`);
      }
    }
  };

  const remove = async (line: LineState): Promise<void> => {
    if (!line.key) return;
    await api(`/admin/lesson-audio?key=${encodeURIComponent(line.key)}`, { method: 'DELETE' });
    await load();
  };

  const step = (from: number, by: -1 | 1): void => {
    const at = myLines.indexOf(from);
    const to = myLines[at + by];
    if (to !== undefined) {
      setSelected(to);
      lineRefs.current.get(to)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  return (
    <div className="cv-studio-page">
      <PageHeader
        back={{ href: '#/audio/conversations', label: 'All conversations' }}
        title={conversation.title || 'Conversation'}
        meta={
          <>
            <Badge tone={STATUS_TONE[lesson.status]}>{STATUS_NAME[lesson.status]}</Badge>
            <Badge>
              {progress.reduce((n, p) => n + p.recorded, 0)} of {progress.reduce((n, p) => n + p.total, 0)} lines recorded
            </Badge>
          </>
        }
        subtitle={`In “${lesson.titleEn}”, exercise ${lesson.exercisePosition}. Each person records their own part, wherever they are; the others’ takes appear here as they are made.`}
        actions={
          <>
            {all.length > 0 &&
              (player.playing !== null ? (
                <Button icon="stop" onClick={player.stop}>
                  Stop
                </Button>
              ) : (
                <Button icon="play" onClick={() => player.playAll(all)}>
                  Play it through
                </Button>
              ))}
            <a className="button-link" href={`#/lessons/${lesson.id}`}>
              <Icon name="book" />
              Open the lesson
            </a>
          </>
        }
      />

      <Section title="Who are you recording?" description="Choose your part. Only its lines ask for your voice; the others’ lines play so you can answer them.">
        <div className="cv-parts" role="radiogroup" aria-label="Your part">
          {progress.map((p) => (
            <button
              key={p.part}
              type="button"
              role="radio"
              aria-checked={p.part === part}
              className={`cv-part part-${p.part}${p.part === part ? ' is-on' : ''}`}
              onClick={() => choosePart(p.part)}
            >
              {p.character ? <img src={bustUrl(p.character)} width={44} height={44} alt="" /> : <span className="cv-initial">{p.name.slice(0, 1)}</span>}
              <span className="cv-part-text">
                <strong>{p.name}</strong>
                <span className="subtle">
                  {p.recorded} of {p.total} recorded{p.by.length > 0 ? ` · by ${p.by.join(', ')}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="cv-share">
          <p className="subtle">
            Recording with someone else? Send them their part. They open the link, sign in with their own admin account, and record only their lines.
          </p>
          <div className="cv-share-buttons">
            {progress
              .filter((p) => p.part !== part)
              .map((p) => (
                <Button key={p.part} icon="external" onClick={() => void send(p.part)}>
                  Send {p.name}’s part
                </Button>
              ))}
          </div>
        </div>
      </Section>

      <Section
        title="The conversation"
        description={
          mine.total === mine.recorded
            ? `All of ${me.name}’s lines are recorded. Play it through to hear how it sounds together, or record a line again.`
            : `${me.name} has ${mine.total - mine.recorded} ${mine.total - mine.recorded === 1 ? 'line' : 'lines'} to record. Hear the line before, then say yours.`
        }
      >
        <ol className="cv-script">
          {rec.lines.map((line) => {
            const said = conversation.lines[line.index]!;
            const who = conversation.speakers[line.part]!;
            const isMine = line.part === part;
            const open = isMine && selected === line.index;
            const before = lineBefore(rec, line.index);
            const script = scriptOf(said.text);
            return (
              <li
                key={line.index}
                ref={(el) => {
                  if (el) lineRefs.current.set(line.index, el);
                  else lineRefs.current.delete(line.index);
                }}
                className={`cv-line part-${line.part}${isMine ? ' is-mine' : ''}${open ? ' is-on' : ''}${player.playing === line.index ? ' is-playing' : ''}`}
                aria-current={player.playing === line.index ? 'true' : undefined}
              >
                <div className="cv-line-head">
                  {who.character ? <img src={bustUrl(who.character)} width={28} height={28} alt="" /> : <span className="cv-initial small">{who.name.slice(0, 1)}</span>}
                  <strong>{who.name}</strong>
                  {line.recording ? (
                    <span className="badge ok">Recorded</span>
                  ) : (
                    <span className={`badge${isMine ? ' mid' : ''}`}>{isMine ? 'Yours to record' : `Waiting for ${who.name}`}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="ghost cv-line-main"
                  onClick={() => (isMine ? setSelected(open ? null : line.index) : line.recording && player.play(line.index, line.recording.url))}
                  aria-expanded={isMine ? open : undefined}
                >
                  <span className="cv-text" lang={script.lang} dir={script.dir}>
                    {said.text}
                  </span>
                  {said.en && <span className="cv-en subtle">{said.en}</span>}
                </button>
                <div className="cv-line-tools">
                  {line.recording && (
                    <Button
                      variant="ghost"
                      icon={player.playing === line.index ? 'stop' : 'play'}
                      onClick={() => (player.playing === line.index ? player.stop() : player.play(line.index, line.recording!.url))}
                      aria-label={`${player.playing === line.index ? 'Stop' : 'Play'} ${who.name}: “${said.text}”`}
                    >
                      {player.playing === line.index ? 'Stop' : 'Play'}
                    </Button>
                  )}
                  {line.recording?.recordedBy && (
                    <span className="subtle cv-by">
                      {line.recording.recordedBy.username ?? 'Someone'} · <Time value={line.recording.updatedAt} />
                    </span>
                  )}
                </div>
                {open && (
                  <div className="cv-recorder">
                    {before ? (
                      <div className="cv-before">
                        <span className="subtle">
                          Before you: {conversation.speakers[before.part]!.name} says “{conversation.lines[before.index]!.text}”
                        </span>
                        {before.recording ? (
                          <Button icon="play" onClick={() => player.play(before.index, before.recording!.url)}>
                            Hear it first
                          </Button>
                        ) : (
                          <span className="subtle">Not recorded yet: say yours as an answer to it all the same.</span>
                        )}
                      </div>
                    ) : (
                      <p className="subtle cv-before">Yours is the first line: it starts the conversation.</p>
                    )}
                    {line.recording && who.character && (
                      <SpeakingPreview
                        key={`${line.recording.url}|${who.character}`}
                        speaker={who.character}
                        url={line.recording.url}
                        text={said.text}
                        lipsync={line.recording.hasLipsync ? undefined : null}
                        durationMs={line.recording.durationMs}
                      />
                    )}
                    <ClipRecorder
                      say={said.text}
                      maxSeconds={LESSON_AUDIO_MAX_SECONDS}
                      what="one line"
                      recording={line.recording ? { url: line.recording.url, durationMs: line.recording.durationMs, updatedAt: line.recording.updatedAt } : null}
                      shortcuts
                      onPrev={() => step(line.index, -1)}
                      onNext={() => step(line.index, 1)}
                      onSave={(wav) => save(line, wav)}
                      removePrompt={`Remove ${who.name}’s recording of “${said.text}”?\n\nThe line is read without sound until a new one is saved.`}
                      onRemove={() => remove(line)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="cv-help">
          <p className="subtle">
            Say each line as you would to the person in front of you, at a pace a learner can follow. Silence before and after is cut and the volume is levelled. Learners see{' '}
            {me.character ? 'your character say it, its mouth moving with your voice' : 'the line as you say it'}.
          </p>
          <ShortcutHint />
        </div>
      </Section>
    </div>
  );
}
