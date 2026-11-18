import { useCallback, useEffect, useState } from 'react';
import {
  CHARACTER_NAMES,
  HEAR_STAGES,
  dialectDirection,
  hearItClipPath,
  learnGame,
  meaningIn,
  type GameDialect,
  type HearItCorrection,
  type HearItHint,
  type HearItItemView,
  type HearStage,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon, HeadphonesIcon, PlayIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { API_URL } from '../lib/config';
import { onError, onPlaying, play, stop } from '../lib/sound';
import { TextAnswer } from '../learn/TextAnswer';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useGameDialect, useOpenRound } from './soloRounds';
import './hear-it.css';

/**
 * Hear It, Find It (/app/learn/practice/hear-it), a lesson practice exercise run on the solo kit, hence its place
 * beside the games; learners find it in learn/practiceTools.tsx.
 *
 * A small radio plays the clip, with wave bars that move while a voice plays, dots for the replays left, a tag when
 * the same words return in another voice, and the speaking character's name. Clips play from a per-round handle
 * (`hearItClipPath`) that never reveals the words; the first play starts with the item, and a failed play is refunded.
 * The rung's question offers four choices or, on the last rung, a typed answer with the key bar. Once done, the radio
 * plays freely and the words show with their meaning. Soranî reads right to left; under Reduce Motion the bars stay
 * still.
 */

type Round = SoloRound<HearItItemView, HearItHint, HearItCorrection>;

const TONE = learnGame('hear-it').tone;

const STAGE_KEY: Record<HearStage, MessageKey> = {
  word: 'games.hear.stage.word',
  phrase: 'games.hear.stage.phrase',
  sentence: 'games.hear.stage.sentence',
  type: 'games.hear.stage.type',
};

const WHY_KEY: Record<HearStage, MessageKey> = {
  word: 'games.hear.why.word',
  phrase: 'games.hear.why.phrase',
  sentence: 'games.hear.why.sentence',
  type: 'games.hear.why.type',
};

/** Bars in the wave, each a little out of step with the next. */
const BARS = 11;

function Radio({ item, src, done }: { item: HearItItemView; src: string; done: boolean }): React.JSX.Element {
  const t = useT();
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const allowed = 1 + item.replays;
  const left = Math.max(0, allowed - plays);
  const can = done || plays < allowed;

  useEffect(() => onPlaying((s) => setPlaying(s === src)), [src]);
  useEffect(
    () =>
      onError((s) => {
        if (s !== src) return;
        setFailed(true);
        // a play that never sounded is not one of the player's plays
        setPlays((n) => Math.max(0, n - 1));
      }),
    [src],
  );

  const listen = useCallback(() => {
    if (!can) return;
    setFailed(false);
    if (!done) setPlays((n) => n + 1);
    play(src);
  }, [can, done, src]);

  // a new clip plays as it opens (a tap opened it), and stops when the item goes
  useEffect(() => {
    setPlays(1);
    setFailed(false);
    play(src);
    return () => stop();
  }, [src]);

  const label = plays === 0 ? t('games.hear.play') : t('games.hear.replay');
  return (
    <div className={`hi-radio${playing ? ' is-playing' : ''}`}>
      <div className="hi-top">
        <span className="hi-grille" aria-hidden />
        <div className="hi-tags">
          {item.speaker && <span className="hi-tag">{t('games.hear.speaker', { name: CHARACTER_NAMES[item.speaker] })}</span>}
          {item.newVoice && <span className="hi-tag is-new">{t('games.hear.newVoice')}</span>}
        </div>
      </div>
      <div className="hi-dial">
        <button type="button" className="hi-play" onClick={listen} disabled={!can} aria-label={label}>
          <PlayIcon size={30} />
        </button>
        <span className="hi-wave" aria-hidden>
          {Array.from({ length: BARS }, (_, i) => (
            <span key={i} className="hi-bar" style={{ ['--bar-i' as string]: i }} />
          ))}
        </span>
      </div>
      <div className="hi-count" aria-live="polite">
        {done ? (
          <span>{t('games.hear.free')}</span>
        ) : (
          <>
            <span className="hi-dots" aria-hidden>
              {Array.from({ length: item.replays }, (_, i) => (
                <span key={i} className={`hi-dot${i < Math.min(left, item.replays) ? ' is-left' : ''}`} />
              ))}
            </span>
            <span>{left > 0 ? t('games.hear.replaysLeft', { n: Math.min(left, item.replays) }) : t('games.hear.noReplays')}</span>
          </>
        )}
      </div>
      {failed && <p className="field-error">{t('games.hear.cantPlay')}</p>}
    </div>
  );
}

function HearBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { sessionId, item, result, busy, submit } = round;
  const script = dialectDirection(dialect);
  const src = `${API_URL}${hearItClipPath(sessionId, item.clip)}`;
  const [picked, setPicked] = useState<number | null>(null);
  const [struck, setStruck] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [tried, setTried] = useState<string | null>(null);
  const done = result?.done === true;
  const locked = done || busy;
  const correction = done ? result?.correction : null;
  const formId = `hi-answer-${item.index}`;

  useEffect(() => {
    setPicked(null);
    setStruck([]);
    setTried(null);
  }, [item.index]);

  // a wrong first pick is struck out, and the choice is the player's again
  useEffect(() => {
    if (!result || result.done || result.correct) return;
    const s = result.hint?.struck;
    if (typeof s === 'number') {
      setStruck((was) => (was.includes(s) ? was : [...was, s]));
      setPicked(null);
    }
  }, [result]);

  const choose = (i: number): void => {
    if (locked || struck.includes(i)) return;
    setPicked(i);
    void submit({ choice: i });
  };

  const choices: Array<{ text: string; kurdish: boolean }> | null = item.options
    ? item.options.map((o) => ({ text: o, kurdish: true }))
    : item.meanings
      ? item.meanings.map((m) => ({ text: meaningIn(m, locale) ?? '', kurdish: false }))
      : null;

  const right = !done && result && !result.correct ? result.hint?.right : null;
  const verdict: 'right' | 'wrong' | null = result ? (result.correct ? 'right' : result.done ? 'wrong' : null) : null;

  return (
    <div className={`hi-board lp-tone-${TONE}`}>
      <p className="hi-kicker">{t(STAGE_KEY[item.stage])}</p>
      <Radio item={item} src={src} done={done} />

      {choices ? (
        <div className="hi-choices" role="group" aria-label={t('games.hear.options')}>
          {choices.map((c, i) => {
            const isRight = correction?.choice === i;
            const look = done ? (isRight ? 'right' : picked === i ? 'wrong' : 'dim') : struck.includes(i) ? 'struck' : picked === i ? 'lit' : 'idle';
            return (
              <button
                key={i}
                type="button"
                className={`hi-choice is-${look}`}
                onClick={() => choose(i)}
                disabled={locked || struck.includes(i)}
                aria-pressed={picked === i}
                lang={c.kurdish ? script.lang : locale}
                dir={c.kurdish ? script.dir : 'auto'}
              >
                <span className="hi-choice-text">{c.text}</span>
                {look === 'struck' && <span className="sr-only">{t('games.hear.struck')}</span>}
                {look === 'right' && <CheckIcon size={18} />}
                {look === 'wrong' && <CloseIcon size={18} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hi-typed">
          <TextAnswer
            key={item.index}
            id={formId}
            label={t('games.hear.typeLabel')}
            dialect={dialect}
            locked={done}
            busy={busy}
            verdict={verdict}
            onReady={setReady}
            onAnswer={(answer) => {
              if (tried === answer.text) return;
              setTried(answer.text);
              void submit({ text: answer.text });
            }}
          />
          {right && right.length > 0 && (
            // one mark per typed word, running the way the words run
            <ol className="hi-marks" aria-label={t('games.hear.hintTyped')} dir={script.dir}>
              {right.map((ok, i) => (
                <li key={i} className={`hi-mark${ok ? ' is-right' : ''}`}>
                  {ok ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
                  <span className="sr-only">{ok ? t('games.solo.right') : t('games.hear.notThis')}</span>
                </li>
              ))}
            </ol>
          )}
          {!done && (
            <Button type="submit" form={formId} disabled={locked || !ready}>
              {result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
            </Button>
          )}
        </div>
      )}

      {!done && result && !result.correct && (
        <p className="hi-hint">{result.hint?.struck !== null && result.hint?.struck !== undefined ? t('games.hear.hintStruck') : t('games.hear.hintTyped')}</p>
      )}

      {correction && (
        <section className="hi-said" aria-label={t('games.hear.said')}>
          <p className="hi-said-label">{t('games.hear.said')}</p>
          <p className="hi-said-text" lang={script.lang} dir={script.dir}>
            {correction.text}
          </p>
          {meaningIn(correction.meanings, locale) && (
            <p className="hi-said-meaning" lang={locale} dir="auto">
              {meaningIn(correction.meanings, locale)}
            </p>
          )}
          {correction.verdict === 'typo' && <p className="hi-said-note">{t('games.hear.typo')}</p>}
        </section>
      )}
    </div>
  );
}

/** The ladder a round climbs, for the intro: four rungs, the last for the advanced round only. */
function HearLadder(): React.JSX.Element {
  const t = useT();
  return (
    <section className={`hi-ladder lp-tone-${TONE}`} aria-labelledby="hi-ladder-title">
      <h2 id="hi-ladder-title" className="hi-ladder-title">
        <HeadphonesIcon size={18} /> {t('games.hear.ladder')}
      </h2>
      <ol className="hi-rungs">
        {HEAR_STAGES.map((stage, i) => (
          <li key={stage} className="hi-rung">
            <span className="hi-rung-n" aria-hidden>
              {i + 1}
            </span>
            <span className="hi-rung-name">{t(STAGE_KEY[stage])}</span>
            {stage === 'type' && <span className="hi-rung-meta">{t('games.hear.ladder.advanced')}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HearIt(): React.JSX.Element {
  const t = useT();
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  const open = useOpenRound('hear-it', dialect);
  const game = availability?.games.find((g) => g.id === 'hear-it');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  return (
    <div className="container solo-page">
      <SoloGameShell<HearItItemView, HearItHint, HearItCorrection>
        game="hear-it"
        dialect={dialect}
        title={t('games.hear.name')}
        blurb={t('games.hear.intro')}
        intro={<HearLadder />}
        difficulties={difficulties}
        open={open}
        renderRound={(round) => <HearBoard round={round} dialect={dialect} />}
        explain={(why) => (why in WHY_KEY ? t(WHY_KEY[why as HearStage]) : null)}
      />
    </div>
  );
}
