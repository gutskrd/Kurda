import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppLocale } from '@kurda/shared';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { latinSound, latinWord, pairWord, play, soraniSound, useRecordings } from './audio';
import { LATIN, SORANI, compareLocaleOf, likeFor, type Likeness } from './letters';
import { Meaning } from './Meaning';
import { again, makeRound, type Option, type Question, type Script, type Topic } from './practice';
import { Sound } from './Sound';

interface Item {
  q: Question;
  /** a miss coming back later in the round; it does not count toward the score */
  retry: boolean;
}

const POSITION: Record<'start' | 'middle' | 'end', MessageKey> = {
  start: 'alphabet.form.start',
  middle: 'alphabet.form.middle',
  end: 'alphabet.form.end',
};

/** How far back a missed question comes: far enough to be recalled, not just remembered. */
const COMEBACK = 3;

function Like({ like }: { like: Likeness }): React.JSX.Element {
  return (
    <span className="ab-like" dir="auto">
      {like.before}
      {like.sound && <mark>{like.sound}</mark>}
      {like.after}
    </span>
  );
}

function Glyph({ o, className = '' }: { o: Option; className?: string }): React.JSX.Element {
  return (
    <span className={`${className}${o.script === 'ckb' ? ' ab-ar' : ''}`} lang={o.script === 'ckb' ? 'ckb' : 'ku'} dir={o.script === 'ckb' ? 'rtl' : 'ltr'}>
      {o.text}
    </span>
  );
}

function clipOf(q: Question): string | null {
  return 'clip' in q ? q.clip : null;
}

export function Practice({ script, locale, onOpen }: { script: Script; locale: AppLocale; onOpen: (id: string) => void }): React.JSX.Element {
  const t = useT();
  // a round started after the recordings arrive asks with them
  useRecordings();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState<Topic[]>([]);
  const [results, setResults] = useState<Array<boolean | null>>([]);
  const nextRef = useRef<HTMLButtonElement>(null);

  const start = (focus: string[] | null = null): void => {
    const round = makeRound(script, locale, focus);
    setQueue(round.map((q) => ({ q, retry: false })));
    setResults(round.map(() => null));
    setAt(0);
    setChosen(null);
    setMissed([]);
  };

  const item = queue?.[at];
  const q = item?.q;
  const done = queue !== null && at >= queue.length;
  const firstTries = results.length;

  // a listening question speaks as it appears; Start was the tap that lets it
  useEffect(() => {
    const clip = q ? clipOf(q) : null;
    if (clip) play(clip);
  }, [q]);

  const choose = useCallback(
    (id: string) => {
      if (!q || !item || chosen !== null) return;
      setChosen(id);
      const right = id === q.answer;
      if (!item.retry) {
        const original = queue!.slice(0, at + 1).filter((i) => !i.retry).length - 1;
        setResults((r) => r.map((v, i) => (i === original ? right : v)));
      }
      if (!right) {
        setMissed((m) => (m.some((x) => x.id === q.topic.id && x.script === q.topic.script) ? m : [...m, q.topic]));
        if (!item.retry) {
          setQueue((qs) => {
            const list = [...qs!];
            list.splice(Math.min(at + 1 + COMEBACK, list.length), 0, { q: again(q), retry: true });
            return list;
          });
        }
      }
    },
    [q, item, chosen, queue, at],
  );

  const advance = useCallback(() => {
    setAt((n) => n + 1);
    setChosen(null);
  }, []);

  useEffect(() => {
    if (chosen !== null) nextRef.current?.focus();
  }, [chosen]);

  // 1–3 answer, Enter goes on — so a reader on a keyboard never has to reach for the mouse
  useEffect(() => {
    if (!q) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (chosen === null && n >= 1 && n <= q.options.length) {
        e.preventDefault();
        choose(q.options[n - 1]!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, chosen, choose]);

  const ask = (question: Question): string => {
    switch (question.kind) {
      case 'hear':
        return t('alphabet.practice.qHear');
      case 'like':
        return t('alphabet.practice.qSound');
      case 'spell':
        return t('alphabet.practice.qSpell');
      case 'pair':
        return t('alphabet.practice.qPair');
      case 'form':
        return t('alphabet.practice.qForm');
      case 'script':
        return question.prompt.script === 'kmr' ? t('alphabet.practice.qToSorani') : t('alphabet.practice.qToLatin');
    }
  };

  const firstRight = results.filter((r) => r === true).length;

  return (
    <section className="ab-practice" aria-labelledby="ab-practice">
      <h2 className="ab-group-title" id="ab-practice">
        {t('alphabet.practice.title')}
      </h2>

      {!queue && (
        <>
          <p className="ab-group-body">{t('alphabet.practice.body')}</p>
          <Button onClick={() => start()}>{t('alphabet.practice.start')}</Button>
        </>
      )}

      {q && item && (
        <div className="ab-q">
          <div className="ab-q-top">
            <ol className="ab-dots" aria-label={t('alphabet.practice.progress', { n: Math.min(results.filter((r) => r !== null).length + (item.retry ? 0 : 1), firstTries), total: firstTries })}>
              {results.map((r, i) => (
                <li key={i} className={r === true ? 'is-right' : r === false ? 'is-wrong' : ''} />
              ))}
            </ol>
            {item.retry && <span className="ab-q-retry">{t('alphabet.practice.retry')}</span>}
          </div>

          <p className="ab-q-ask">{ask(q)}</p>

          <div className="ab-q-prompt">
            {(q.kind === 'hear' || q.kind === 'spell' || q.kind === 'pair') && (
              <Sound src={q.clip} label={t('alphabet.practice.replay')} size="lg" />
            )}
            {q.kind === 'spell' && (
              // for a Kurmancî reader the meaning would be the answer, so they get the Soranî word instead
              <span className="ab-q-meaning">
                <Meaning meaning={q.meaning} script="kmr" locale={locale} />
              </span>
            )}
            {q.kind === 'like' && <Like like={q.like} />}
            {q.kind === 'script' && <Glyph o={q.prompt} className="ab-q-glyph" />}
            {q.kind === 'form' && (
              <span className="ab-q-form">
                <span className="ab-q-glyph ab-ar" lang="ckb" dir="rtl">
                  {q.prompt}
                </span>
                <small>{t(POSITION[q.position])}</small>
              </span>
            )}
          </div>

          <div className={`ab-q-options${q.kind === 'spell' || q.kind === 'pair' ? ' is-words' : ''}`}>
            {q.options.map((o, i) => {
              const state = chosen === null ? '' : o.id === q.answer ? ' is-right' : o.id === chosen ? ' is-wrong' : ' is-dim';
              return (
                <button key={o.id} type="button" className={`ab-tile ab-option${state}`} disabled={chosen !== null} onClick={() => choose(o.id)}>
                  <span className="ab-key" aria-hidden="true">
                    {i + 1}
                  </span>
                  <Glyph o={o} className="ab-tile-glyph" />
                </button>
              );
            })}
          </div>

          {chosen !== null && (
            <div className="ab-q-feedback" role="status">
              <p className={chosen === q.answer ? 'ab-right' : 'ab-wrong'}>
                {chosen === q.answer
                  ? t('alphabet.practice.right')
                  : t('alphabet.practice.wrong', { letter: q.options.find((o) => o.id === q.answer)!.text })}
                {chosen !== q.answer && !item.retry && <span className="ab-q-comeback"> {t('alphabet.practice.comeback')}</span>}
              </p>
              <Explain q={q} locale={locale} />
              <button type="button" className="btn btn-primary btn-sm" ref={nextRef} onClick={advance}>
                {t('alphabet.practice.next')}
              </button>
            </div>
          )}
          <p className="ab-q-keys">{t('alphabet.practice.keys')}</p>
        </div>
      )}

      {done && (
        <div className={`ab-q-done${missed.length === 0 ? ' is-perfect' : ''}`} role="status">
          {/* a small burst for a clean round: effort noticed, not a slot machine */}
          {missed.length === 0 && (
            <span className="ab-burst" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </span>
          )}
          <ol className="ab-dots" aria-hidden="true">
            {results.map((r, i) => (
              <li key={i} className={r ? 'is-right' : 'is-wrong'} />
            ))}
          </ol>
          <p className="ab-q-score">{t('alphabet.practice.score', { right: firstRight, total: firstTries })}</p>
          {missed.length === 0 ? (
            <p className="ab-group-body">{t('alphabet.practice.perfect')}</p>
          ) : (
            <>
              <p className="ab-group-body">
                {t('alphabet.practice.review')} <span className="muted">{t('alphabet.practice.reviewHint')}</span>
              </p>
              <div className="ab-review">
                {missed.map((m) => {
                  const text = m.script === 'kmr' ? m.id : SORANI.find((l) => l.id === m.id)?.char ?? m.id;
                  return (
                    <button key={`${m.script}:${m.id}`} type="button" className="ab-tile ab-review-tile" onClick={() => onOpen(m.id)}>
                      <Glyph o={{ id: m.id, text, script: m.script }} className="ab-tile-glyph" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="ab-q-actions">
            {missed.length > 0 && <Button onClick={() => start(missed.map((m) => m.id))}>{t('alphabet.practice.focus')}</Button>}
            <Button variant="secondary" onClick={() => start()}>
              {t('alphabet.practice.again')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Why the answer is what it is: the letter, its sound, a word with it in. */
function Explain({ q, locale }: { q: Question; locale: AppLocale }): React.JSX.Element | null {
  const t = useT();
  if (q.kind === 'pair') {
    return (
      <div className="ab-explain">
        <p className="ab-explain-note">{t('alphabet.practice.pairWhy')}</p>
        <div className="ab-explain-pair">
          {[q.pair.a, q.pair.b].map((w) => (
            <span key={w.word} className="ab-explain-word">
              <span lang="ku">{w.word}</span>
              <Sound src={pairWord(w.word)} label={t('alphabet.listenWord')} size="sm" />
              <Meaning meaning={w.meaning} script="kmr" locale={locale} />
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (q.topic.script === 'kmr') {
    const l = LATIN.find((x) => x.id === q.topic.id);
    if (!l) return null;
    const like = compareLocaleOf(locale) ? likeFor(l.id, locale) : null;
    return (
      <div className="ab-explain">
        <span className="ab-explain-letter" lang="ku">
          {l.upper}
          <small>{l.id}</small>
        </span>
        <Sound src={latinSound(l.id)} label={t('alphabet.listen')} size="sm" />
        <span className="ab-explain-text">
          {like ? <Like like={like} /> : l.sorani && <span className="ab-ar" lang="ckb">{l.sorani}</span>}
          <span className="ab-explain-word">
            <span lang="ku">{l.word}</span>
            <Sound src={latinWord(l.id)} label={t('alphabet.listenWord')} size="sm" />
            <Meaning meaning={l.meaning} script="kmr" locale={locale} />
          </span>
        </span>
      </div>
    );
  }
  const l = SORANI.find((x) => x.id === q.topic.id);
  if (!l) return null;
  return (
    <div className="ab-explain">
      <span className="ab-explain-letter ab-ar" lang="ckb">
        {l.char}
      </span>
      <Sound src={soraniSound(l)} label={t('alphabet.listen')} size="sm" />
      <span className="ab-explain-text">
        {l.latin && (
          <span>
            {t('alphabet.inKurmanci')}: <strong lang="ku">{l.latin}</strong>
          </span>
        )}
        <span className="ab-explain-word">
          <span className="ab-ar" lang="ckb">
            {l.word}
          </span>
          <Meaning meaning={l.meaning} script="ckb" locale={locale} />
        </span>
      </span>
    </div>
  );
}

