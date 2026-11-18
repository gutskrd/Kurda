import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PracticeHub as Hub, PracticeHubUnit } from '@kurda/shared';
import { Button } from '../components/Button';
import { AccuracyIcon, ArrowIcon, ChevronIcon, HeadphonesIcon, MicIcon, TextIcon, TrophyIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ReviewEntry } from '../learn/ReviewEntry';
import { useLessonExercises, type WebExercise } from '../learn/practiceTools';
import type { PracticeDue } from '../learn/types';
import { useApiGet } from '../lib/useApi';
import { KIND_HUES, KIND_MODE, kindRows, practiceHref, type KindKey, type KindRow, type Line } from './hub';
import { askMicrophone, useMicBlocked, type MicAnswer } from './microphone';
import '../learn/path.css';
import './practice.css';

const KIND_ICON: Record<KindKey, (p: { size?: number }) => React.JSX.Element> = {
  mistakes: AccuracyIcon,
  words: TextIcon,
  listen: HeadphonesIcon,
  speak: MicIcon,
  unit: TrophyIcon,
};

/** What the page says when speaking cannot start, and whether trying again could help. */
const MIC_PROBLEM: Record<Exclude<MicAnswer, 'granted'>, { key: MessageKey; again: boolean }> = {
  denied: { key: 'practice.mic.denied', again: true },
  noMic: { key: 'practice.mic.noMic', again: true },
  failed: { key: 'practice.mic.failed', again: true },
  unsupported: { key: 'practice.mic.unsupported', again: false },
};

/**
 * Practice (/app/learn/practice), reached from review on Learn: review first, then every other kind, each a session of
 * the lesson player over what the learner has met (shared practice.ts). Kinds with nothing to practise stay listed,
 * dimmed, saying what would fill them; the two lesson exercises join their nearest kind while offered.
 *
 * Speaking asks for the microphone only when it is started. Refused, missing or unable, the page says so plainly under
 * the list, where the other kinds, which need no microphone, are one press away.
 */
export function PracticeHub(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const hub = useApiGet<Hub>('/practice/hub');
  const due = useApiGet<PracticeDue>('/practice/due');
  const exercises = useLessonExercises();
  const blocked = useMicBlocked();
  const [mic, setMic] = useState<MicAnswer | 'asking' | null>(null);
  const [picking, setPicking] = useState(false);

  const speak = async (): Promise<void> => {
    setMic('asking');
    const answer = await askMicrophone();
    if (answer === 'granted') navigate(practiceHref('speak'));
    else setMic(answer);
  };

  // A refusal the browser already holds is said before anything is pressed.
  const problem = mic && mic !== 'asking' && mic !== 'granted' ? mic : blocked ? 'denied' : null;
  const exercise = (id: string): { id: string; web: WebExercise } | undefined => exercises.find((e) => e.id === id);

  return (
    <div className="container practice-page">
      <Link to="/app/learn" className="back-link">
        <ArrowIcon size={16} />
        {t('coursemap.back')}
      </Link>
      <h1 className="page-title">{t('practice.title')}</h1>
      <p className="page-sub">{t('practice.sub')}</p>

      <ReviewEntry due={due} heading="h2" />

      <section className="practice-kinds" aria-labelledby="practice-kinds-title">
        <h2 className="learn-section-title" id="practice-kinds-title">
          {t('practice.kinds')}
        </h2>
        {hub.error && !hub.data ? (
          <ErrorState message={hub.error} onRetry={hub.reload} />
        ) : !hub.data ? (
          <KindsSkeleton />
        ) : (
          <ul className="list">
            {kindRows(hub.data).map((row) => (
              <KindItem
                key={row.key}
                row={row}
                // While the microphone is asked for, and when it is off for the site, speaking says so in its line.
                detail={row.key === 'speak' && row.ready ? (mic === 'asking' ? { key: 'lesson.speak.asking' } : problem === 'denied' ? { key: 'practice.hub.micOff' } : row.detail) : row.detail}
                onSpeak={() => void speak()}
                onPick={() => setPicking(true)}
                after={row.key === 'words' ? exercise('build-sentence') : row.key === 'listen' ? exercise('hear-it') : undefined}
              />
            ))}
          </ul>
        )}
        {problem && hub.data && (
          <div className="msg msg-error practice-mic" role="alert">
            <p>{t(MIC_PROBLEM[problem].key)}</p>
            {MIC_PROBLEM[problem].again && (
              <Button variant="secondary" size="sm" onClick={() => void speak()}>
                {t('lesson.speak.tryMic')}
              </Button>
            )}
          </div>
        )}
      </section>

      <UnitSheet open={picking} units={hub.data?.units ?? []} onClose={() => setPicking(false)} />
    </div>
  );
}

/** One kind as a row of the list, and the lesson exercise that follows it when one is offered. */
function KindItem({
  row,
  detail,
  onSpeak,
  onPick,
  after,
}: {
  row: KindRow;
  detail: Line;
  onSpeak: () => void;
  onPick: () => void;
  after?: { id: string; web: WebExercise };
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const Icon = KIND_ICON[row.key];
  const line = t(detail.key, detail.count === undefined ? undefined : { count: detail.count.toLocaleString(locale) });
  const words = (
    <>
      <span className={`practice-badge hue-${KIND_HUES[row.key]}`} aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="list-row-text">
        <span className="list-row-title">{t(row.title)}</span>
        <span className={`list-row-sub${row.waiting ? ' is-waiting' : ''}`}>{line}</span>
      </span>
      {row.ready && <ChevronIcon size={16} className="list-row-go flip-rtl" />}
    </>
  );
  let main: React.ReactNode;
  if (!row.ready) {
    main = (
      <span className="list-row-main is-off" aria-disabled="true">
        {words}
      </span>
    );
  } else if (row.key === 'speak') {
    main = (
      <button type="button" className="list-row-main" onClick={onSpeak}>
        {words}
      </button>
    );
  } else if (row.key === 'unit') {
    main = (
      <button type="button" className="list-row-main" aria-haspopup="dialog" onClick={onPick}>
        {words}
      </button>
    );
  } else {
    main = (
      <Link to={practiceHref(KIND_MODE[row.key])} className="list-row-main">
        {words}
      </Link>
    );
  }
  return (
    <>
      <li className="list-row">{main}</li>
      {after && <ExerciseItem id={after.id} web={after.web} />}
    </>
  );
}

/** A lesson exercise with a page of its own (learn/practiceTools.tsx), listed like a kind. */
function ExerciseItem({ id, web }: { id: string; web: WebExercise }): React.JSX.Element {
  const t = useT();
  const { Icon } = web;
  const hue = id === 'build-sentence' ? KIND_HUES.sentence : KIND_HUES.hear;
  return (
    <li className="list-row">
      <Link to={web.href} className="list-row-main">
        <span className={`practice-badge hue-${hue}`} aria-hidden="true">
          <Icon size={22} />
        </span>
        <span className="list-row-text">
          <span className="list-row-title">{t(web.nameKey)}</span>
          <span className="list-row-sub">{t(web.bodyKey)}</span>
        </span>
        <ChevronIcon size={16} className="list-row-go flip-rtl" />
      </Link>
    </li>
  );
}

/** The chapters finished, latest first, each in its colour with its number; one opens its own review. */
function UnitSheet({ open, units, onClose }: { open: boolean; units: PracticeHubUnit[]; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <Sheet open={open} onClose={onClose} label={t('practice.hub.unit')} className="practice-units">
      <h2 className="practice-units-title">{t('practice.hub.unit')}</h2>
      <ul className="list">
        {units.map((unit) => {
          const n = unit.number.toLocaleString(locale);
          return (
            <li key={unit.unitId} className="list-row">
              <Link to={practiceHref('unit', unit.unitId)} className={`list-row-main lp-tone-${unit.tone}`}>
                <span className="practice-unit-disc" aria-hidden="true">
                  {n}
                </span>
                <span className="list-row-text">
                  <span className="practice-unit-eyebrow">{t('coursemap.unit', { n })}</span>
                  <span className="list-row-title">{unit.title}</span>
                </span>
                <ChevronIcon size={16} className="list-row-go flip-rtl" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** The list while it loads: five rows of its shape. */
function KindsSkeleton(): React.JSX.Element {
  return (
    <ul className="list skeleton-late" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="list-row">
          <span className="list-row-main">
            <Skeleton w={44} h={44} radius="var(--r-md)" />
            <span className="list-row-text">
              <Skeleton line w="40%" />
              <Skeleton line w="65%" />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
