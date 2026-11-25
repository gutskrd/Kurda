import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  eventQuestShare,
  eventQuestState,
  eventQuestTitle,
  eventRewardParts,
  sortEventQuests,
  type ActiveEvent,
  type EventQuest,
  type EventQuests,
  type EventQuestType,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ArrowIcon, CheckIcon } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/states';
import { useLocale, useT, type Translate } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import { playLessonSound } from '../lib/sounds';
import type { ApiError } from '../lib/types';
import { BoardAmount } from '../ui/BoardSwitch';
import './events.css';

/** The app's words for a kind of quest, where its author gave it no title in the reader's language. */
const KIND_TITLE: Record<EventQuestType, MessageKey> = {
  earn_xp: 'events.quest.earnXp',
  story_quizzes: 'events.quest.storyQuizzes',
  complete_lessons: 'events.quest.completeLessons',
};

/** When an event ends, as a date, or as a time when that is today; nothing counts down. */
function endsText(iso: string, t: Translate, locale: string, now = new Date()): string {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return '';
  if (end.toDateString() === now.toDateString()) {
    return t('events.endsToday', { time: end.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) });
  }
  return t('events.ends', { date: end.toLocaleDateString(locale, { day: 'numeric', month: 'long' }) });
}

type Load = { state: 'loading' } | { state: 'failed'; error: string } | { state: 'ready'; events: EventQuests[]; missing: string | null };

/**
 * The events running now (/app/events), reached from Learn's event card: each event's quests, what each pays and how
 * far along it is, with Claim on those done. Quests ready to claim come first and claimed ones last (shared
 * `sortEventQuests`). A claim waits for the server, since it moves currency, and the quests are read again either way;
 * a refusal is said above the quests. Events whose quests did not load are named with a retry, and between events the
 * page says what events are and where they show.
 */
export function EventsPage(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<ApiError | null>(null);

  const read = useCallback(async (): Promise<void> => {
    const active = await client.get<{ events: ActiveEvent[] }>('/events/active');
    if (!active.ok) {
      setLoad({ state: 'failed', error: describeError(active.error, t) });
      return;
    }
    const views = await Promise.all(active.data.events.map((e) => client.get<EventQuests>(`/events/${encodeURIComponent(e.key)}/quests`)));
    const events = views.flatMap((v) => (v.ok ? [v.data] : []));
    const failed = views.find((v) => !v.ok);
    const missing = failed && !failed.ok ? describeError(failed.error, t) : null;
    if (missing && events.length === 0) setLoad({ state: 'failed', error: missing });
    else setLoad({ state: 'ready', events, missing });
  }, [client, t]);

  useEffect(() => {
    void read();
  }, [read]);

  const claim = async (eventKey: string, quest: EventQuest): Promise<void> => {
    setClaiming(quest.id);
    setRefusal(null);
    const res = await client.post(`/events/${encodeURIComponent(eventKey)}/quests/${encodeURIComponent(quest.id)}/claim`);
    if (res.ok) {
      haptic('celebrate');
      playLessonSound('reward');
      setClaimed(quest.id);
    } else {
      setRefusal(res.error);
    }
    // A refusal usually means the server sees the quests differently, so they are read again either way.
    await read();
    setClaiming(null);
  };

  return (
    <div className="container events-page">
      <Link to="/app/learn" className="back-link">
        <ArrowIcon size={16} />
        {t('coursemap.back')}
      </Link>
      <h1 className="page-title">{t('events.title')}</h1>

      {load.state === 'loading' ? (
        <EventsSkeleton />
      ) : load.state === 'failed' ? (
        <ErrorState message={load.error} onRetry={() => void read()} />
      ) : load.events.length === 0 ? (
        // The way back to Learn is the page's own back link, just above.
        <EmptyState title={t('events.none')} message={t('events.noneBody')} />
      ) : (
        <>
          {refusal && (
            <div className="msg msg-error events-notice" role="alert">
              <p>{refusal.kind === 'client' ? t('events.claimFailed') : describeError(refusal, t)}</p>
              <button type="button" className="link-button" onClick={() => setRefusal(null)}>
                {t('common.close')}
              </button>
            </div>
          )}
          {load.missing && (
            <div className="msg msg-error events-notice" role="alert">
              <p>
                <strong>{t('events.someMissing')}</strong> {load.missing}
              </p>
              <button type="button" className="link-button" onClick={() => void read()}>
                {t('common.retry')}
              </button>
            </div>
          )}
          {load.events.map((event) => (
            <EventBlock key={event.eventKey} event={event} claiming={claiming} claimed={claimed} onClaim={(q) => void claim(event.eventKey, q)} />
          ))}
        </>
      )}
    </div>
  );
}

function EventBlock({
  event,
  claiming,
  claimed,
  onClaim,
}: {
  event: EventQuests;
  claiming: string | null;
  /** The quest claimed just now on this page, which says so with a little more. */
  claimed: string | null;
  onClaim: (quest: EventQuest) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const headingId = `event-${event.eventKey}`;
  return (
    <section className="event" aria-labelledby={headingId}>
      <header className="event-head">
        <h2 className="event-name" id={headingId}>
          {event.name}
        </h2>
        <p className="event-ends">{endsText(event.endsAt, t, locale)}</p>
      </header>
      {event.zerForMembers && <p className="event-members">{t('events.membersZer')}</p>}
      <ul className="event-quests">
        {sortEventQuests(event.quests).map((quest) => (
          <QuestRow key={quest.id} quest={quest} busy={claiming === quest.id} fresh={claimed === quest.id} disabled={claiming !== null} onClaim={() => onClaim(quest)} />
        ))}
      </ul>
    </section>
  );
}

function QuestRow({
  quest,
  busy,
  fresh,
  disabled,
  onClaim,
}: {
  quest: EventQuest;
  busy: boolean;
  fresh: boolean;
  disabled: boolean;
  onClaim: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => n.toLocaleString(locale);
  const state = eventQuestState(quest);
  const title = eventQuestTitle(quest, locale) ?? t(KIND_TITLE[quest.type]);
  const parts = eventRewardParts(quest.reward);
  const shown = Math.min(quest.current, quest.target);
  return (
    <li className={`event-quest is-${state}${fresh ? ' is-fresh' : ''}`}>
      <div className="event-quest-top">
        <p className="event-quest-title">{title}</p>
        {parts.length > 0 && (
          <p className="event-quest-reward">
            <span className="sr-only">{t('events.reward')}</span>
            {parts.map((p) => (
              <BoardAmount key={p.currency} type="zer" amount={p.amount} />
            ))}
          </p>
        )}
      </div>
      <div className="event-quest-foot">
        <span
          className="event-quest-bar"
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={quest.target}
          aria-valuenow={shown}
          aria-valuetext={t('quests.barText', { progress: number(shown), target: number(quest.target) })}
        >
          <span style={{ width: `${Math.round(eventQuestShare(quest) * 100)}%` }} />
        </span>
        {state === 'claimed' ? (
          <span className="event-quest-claimed">
            <CheckIcon size={16} weight="bold" />
            {t('events.claimed')}
          </span>
        ) : state === 'claimable' ? (
          <Button size="sm" onClick={onClaim} disabled={disabled} aria-busy={busy || undefined}>
            {busy ? <span className="spinner event-quest-spinner" aria-hidden="true" /> : null}
            {t('events.claim')}
          </Button>
        ) : (
          <span className="event-quest-count" aria-hidden="true" dir="ltr">
            {number(shown)} / {number(quest.target)}
          </span>
        )}
      </div>
    </li>
  );
}

/** The page's shape while the events load: a heading and three quests. */
function EventsSkeleton(): React.JSX.Element {
  return (
    <div className="event skeleton-late" aria-hidden="true">
      <Skeleton w={160} h={22} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} h={84} radius="var(--r-lg)" />
      ))}
    </div>
  );
}
