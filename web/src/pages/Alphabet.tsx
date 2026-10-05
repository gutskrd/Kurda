import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '@fontsource-variable/vazirmatn';
import type { AppLocale } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useMediaQuery } from '../lib/useMediaQuery';
import { publishedDictionary } from '../layouts/navLinks';
import {
  LATIN,
  MEANINGS,
  SORANI,
  bandOf,
  compareLocaleOf,
  formsOf,
  indexInWord,
  likeFor,
  soraniLikeFor,
  type Band,
  type LatinLetter,
  type Likeness,
  type SoraniLetter,
} from '../alphabet/letters';

/**
 * The alphabet, for a beginner: every letter, what it sounds like next to the
 * reader's own language, and a word to remember it by. See
 * `alphabet/letters.ts` for how it teaches and why.
 *
 * Open to everyone, account or not: it is the first thing a beginner needs and
 * it costs nothing to serve — no request leaves the page.
 */

type Script = 'kmr' | 'ckb';

interface Group<L> {
  id: string;
  title: MessageKey;
  body: MessageKey;
  letters: L[];
}

const BAND_TITLE: Record<Band, MessageKey> = {
  watch: 'alphabet.group.watch',
  new: 'alphabet.group.new',
  same: 'alphabet.group.same',
};
const BAND_BODY: Record<Band, MessageKey> = {
  watch: 'alphabet.group.watchBody',
  new: 'alphabet.group.newBody',
  same: 'alphabet.group.sameBody',
};

/** Kurmancî, sorted against the reader's language — the false friends first, because that is where the mistakes are. */
function latinGroups(locale: AppLocale): Group<LatinLetter>[] {
  const lang = compareLocaleOf(locale);
  if (!lang) {
    return [
      { id: 'vowels', title: 'alphabet.group.vowels', body: 'alphabet.group.vowelsBodyKmr', letters: LATIN.filter((l) => l.vowel) },
      { id: 'consonants', title: 'alphabet.group.consonants', body: 'alphabet.group.consonantsBody', letters: LATIN.filter((l) => !l.vowel) },
    ];
  }
  return (['watch', 'new', 'same'] as const)
    .map((band) => ({ id: band, title: BAND_TITLE[band], body: BAND_BODY[band], letters: LATIN.filter((l) => bandOf(l.id, lang) === band) }))
    .filter((g) => g.letters.length > 0);
}

function soraniGroups(): Group<SoraniLetter>[] {
  return [
    { id: 'vowels', title: 'alphabet.group.vowels', body: 'alphabet.group.vowelsBodyCkb', letters: SORANI.filter((l) => l.kind === 'vowel') },
    { id: 'consonants', title: 'alphabet.group.consonants', body: 'alphabet.group.consonantsBody', letters: SORANI.filter((l) => l.kind === 'consonant') },
    { id: 'throat', title: 'alphabet.group.throat', body: 'alphabet.group.throatBody', letters: SORANI.filter((l) => l.kind === 'throat') },
  ];
}

/** A comparison, with the sound itself picked out. */
function Like({ like }: { like: Likeness }): React.JSX.Element {
  return (
    <span className="ab-like" dir="auto">
      {like.before}
      {like.sound && <mark>{like.sound}</mark>}
      {like.after}
    </span>
  );
}

/** A Kurdish word with its letter marked — the shape and the sound met together. */
function KurdishWord({ word, letter }: { word: string; letter: string }): React.JSX.Element {
  const at = indexInWord(word, letter);
  if (at < 0) return <span lang="ku">{word}</span>;
  return (
    <span lang="ku">
      {word.slice(0, at)}
      <mark>{word.slice(at, at + letter.length)}</mark>
      {word.slice(at + letter.length)}
    </span>
  );
}

/**
 * What the example word means — or, for a reader who already speaks that
 * dialect, the same word in the other one, which is the more useful thing to
 * put under it: a Soranî reader learns the Kurmancî word, and the reverse.
 */
function Meaning({ meaning, script, locale }: { meaning: keyof typeof MEANINGS; script: Script; locale: AppLocale }): React.JSX.Element {
  const shown: AppLocale = script === 'kmr' && locale === 'ku' ? 'ckb' : script === 'ckb' && locale === 'ckb' ? 'ku' : locale;
  const other = shown !== locale;
  return (
    <span
      className={`ab-card-meaning${other && shown === 'ckb' ? ' ab-ar' : ''}`}
      lang={other ? shown : undefined}
      dir={other ? (shown === 'ckb' ? 'rtl' : 'ltr') : undefined}
    >
      {MEANINGS[meaning][shown]}
    </span>
  );
}

/** What a tile says under its letter: the sound it is like, or its partner in the other script. */
function latinHint(l: LatinLetter, locale: AppLocale): string | null {
  const lang = compareLocaleOf(locale);
  if (!lang) return l.sorani;
  if (bandOf(l.id, lang) === 'same') return null;
  // a vowel's comparison marks the same letter ("f[a]ther"); repeating it under the tile says nothing
  const sound = likeFor(l.id, locale)?.sound ?? null;
  return sound && sound.toLocaleLowerCase() !== l.id ? sound : null;
}

function useScript(locale: AppLocale): [Script, (s: Script) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get('script');
  const script: Script = asked === 'ckb' || asked === 'kmr' ? asked : locale === 'ckb' ? 'ckb' : 'kmr';
  const set = (s: Script): void => {
    const next = new URLSearchParams(params);
    next.set('script', s);
    setParams(next, { replace: true });
  };
  return [script, set];
}

export function Alphabet(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { status } = useAuth();
  usePageMeta(t('meta.alphabet.title'), t('meta.alphabet.description'));
  const [script, setScript] = useScript(locale);
  const wide = useMediaQuery('(min-width: 960px)');

  const latin = useMemo(() => latinGroups(locale), [locale]);
  const sorani = useMemo(() => soraniGroups(), []);
  const order = script === 'kmr' ? latin.flatMap((g) => g.letters.map((l) => l.id)) : sorani.flatMap((g) => g.letters.map((l) => l.id));

  // on a wide screen there is always a letter open beside the grid; on a phone, one opens when tapped
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    setPicked(null);
    setSheet(false);
  }, [script]);
  const current = picked ?? order[0]!;

  const pick = (id: string): void => {
    setPicked(id);
    if (!wide) setSheet(true);
  };
  const step = (by: number): void => {
    const i = order.indexOf(current);
    setPicked(order[(i + by + order.length) % order.length]!);
  };

  const lang = compareLocaleOf(locale);
  const same = lang ? LATIN.filter((l) => bandOf(l.id, lang) === 'same').length : 0;

  const card =
    script === 'kmr' ? (
      <LatinCard letter={LATIN.find((l) => l.id === current)!} locale={locale} onStep={step} />
    ) : (
      <SoraniCard letter={SORANI.find((l) => l.id === current)!} locale={locale} onStep={step} />
    );

  const dictionary = status === 'signedIn' ? '/app/dictionary' : publishedDictionary(locale);

  return (
    <div className="container ab">
      <div className="page-header">
        <span className="eyebrow">{t('alphabet.eyebrow')}</span>
        <h1 className="page-title">{t('alphabet.title')}</h1>
        <p className="page-sub">{t('alphabet.lead')}</p>
      </div>

      <div className="toolbar" role="tablist" aria-label={t('alphabet.script.label')}>
        {(['kmr', 'ckb'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={script === s}
            className={`chip${script === s ? ' active' : ''}`}
            onClick={() => setScript(s)}
          >
            {t(s === 'kmr' ? 'alphabet.script.kmr' : 'alphabet.script.ckb')}
          </button>
        ))}
      </div>

      <div className="ab-layout">
        <div className="ab-main">
          {script === 'kmr' ? (
            <>
              <p className="ab-summary">
                {lang
                  ? t('alphabet.summary.compare', { same, total: LATIN.length, rest: LATIN.length - same })
                  : t('alphabet.summary.bridge')}
              </p>
              <HatRule />
              {latin.map((g) => (
                <section key={g.id} className={`ab-group ab-group--${g.id}`} aria-labelledby={`ab-${g.id}`}>
                  <h2 className="ab-group-title" id={`ab-${g.id}`}>
                    {t(g.title)} <span className="ab-count">{g.letters.length}</span>
                  </h2>
                  <p className="ab-group-body">{t(g.body)}</p>
                  <div className="ab-grid" dir="ltr">
                    {g.letters.map((l) => {
                      const hint = latinHint(l, locale);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className={`ab-tile${current === l.id ? ' is-on' : ''}`}
                          aria-pressed={current === l.id}
                          aria-label={hint ? t('alphabet.tileLabel', { letter: l.upper, hint }) : l.upper}
                          onClick={() => pick(l.id)}
                        >
                          <span className="ab-tile-glyph" lang="ku">
                            {l.upper}
                            <small>{l.id}</small>
                          </span>
                          {hint && (
                            <span className="ab-tile-hint" dir="auto" aria-hidden="true">
                              {hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <>
              <p className="ab-summary">{t('alphabet.summary.ckb')}</p>
              <JoinDemo />
              {sorani.map((g) => (
                <section key={g.id} className={`ab-group ab-group--${g.id}`} aria-labelledby={`ab-${g.id}`}>
                  <h2 className="ab-group-title" id={`ab-${g.id}`}>
                    {t(g.title)} <span className="ab-count">{g.letters.length}</span>
                  </h2>
                  <p className="ab-group-body">{t(g.body)}</p>
                  <div className="ab-grid" dir="rtl">
                    {g.letters.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`ab-tile${current === l.id ? ' is-on' : ''}${locale === 'ar' && l.kurdishOnly ? ' is-kurdish' : ''}`}
                        aria-pressed={current === l.id}
                        aria-label={l.latin ? t('alphabet.tileLabel', { letter: l.char, hint: l.latin }) : l.char}
                        onClick={() => pick(l.id)}
                      >
                        <span className="ab-tile-glyph ab-ar" lang="ckb">
                          {l.char}
                        </span>
                        {l.latin && (
                          <span className="ab-tile-hint" dir="ltr" lang="ku" aria-hidden="true">
                            {l.latin}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}

          <Practice key={script} script={script} locale={locale} />

          <section className="ab-next" aria-labelledby="ab-next">
            <h2 className="ab-group-title" id="ab-next">
              {t('alphabet.next.title')}
            </h2>
            <div className="ab-next-links">
              <a className="btn btn-secondary" href={dictionary}>
                {t('alphabet.next.dictionary')}
              </a>
              <Link className="btn btn-secondary" to="/app/games/wordle">
                {t('alphabet.next.wordle')}
              </Link>
            </div>
          </section>
        </div>

        {wide && <aside className="ab-aside">{card}</aside>}
      </div>

      {!wide && (
        <Modal open={sheet} onClose={() => setSheet(false)} label={t('alphabet.title')}>
          {card}
        </Modal>
      )}
    </div>
  );
}

/** One rule worth more than five letters: the hat. */
function HatRule(): React.JSX.Element {
  const t = useT();
  return (
    <div className="ab-rule">
      <div className="ab-rule-pairs" dir="ltr" lang="ku" aria-hidden="true">
        <span>i</span>
        <span className="ab-arrow">→</span>
        <span>î</span>
        <span className="ab-sep" />
        <span>u</span>
        <span className="ab-arrow">→</span>
        <span>û</span>
      </div>
      <div>
        <h2 className="ab-rule-title">{t('alphabet.hat.title')}</h2>
        <p className="ab-rule-body">{t('alphabet.hat.body')}</p>
      </div>
    </div>
  );
}

/** A word taken apart and put back together — how Arabic script joins, shown rather than told. */
function JoinDemo(): React.JSX.Element {
  const t = useT();
  const parts = ['ک', 'و', 'ر', 'د', 'ی'];
  return (
    <div className="ab-rule">
      <div className="ab-join" aria-hidden="true">
        <span className="ab-join-parts ab-ar" dir="rtl" lang="ckb">
          {parts.map((p, i) => (
            <span key={i}>{p}</span>
          ))}
        </span>
        <span className="ab-arrow">→</span>
        <span className="ab-join-word ab-ar" dir="rtl" lang="ckb">
          کوردی
        </span>
      </div>
      <div>
        <h2 className="ab-rule-title">{t('alphabet.join.title')}</h2>
        <p className="ab-rule-body">{t('alphabet.join.body')}</p>
      </div>
    </div>
  );
}

function Stepper({ onStep }: { onStep: (by: number) => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="ab-step" dir="ltr">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStep(-1)} aria-label={t('alphabet.prevLetter')}>
        ←
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStep(1)} aria-label={t('alphabet.nextLetter')}>
        →
      </button>
    </div>
  );
}

function LatinCard({ letter, locale, onStep }: { letter: LatinLetter; locale: AppLocale; onStep: (by: number) => void }): React.JSX.Element {
  const t = useT();
  const like = likeFor(letter.id, locale);
  return (
    <article className="ab-card" aria-live="polite">
      <div className="ab-card-head">
        <span className="ab-card-glyph" lang="ku" dir="ltr">
          {letter.upper}
          <small>{letter.id}</small>
        </span>
        <span className="ab-ipa" title={t('alphabet.ipa')} dir="ltr">
          /{letter.ipa}/
        </span>
      </div>

      {like && (
        <div className="ab-card-row">
          <span className="ab-card-label">{t('alphabet.soundsLike')}</span>
          <Like like={like} />
        </div>
      )}

      <div className="ab-card-row">
        <span className="ab-card-label">{t('alphabet.rememberBy')}</span>
        <span className="ab-card-word" dir="ltr">
          <KurdishWord word={letter.word} letter={letter.id} />
        </span>
        <Meaning meaning={letter.meaning} script="kmr" locale={locale} />
      </div>

      <div className="ab-card-row ab-card-bridge">
        <span className="ab-card-label">{t('alphabet.inSorani')}</span>
        {letter.sorani ? (
          <span className="ab-card-partner ab-ar" lang="ckb" dir="rtl">
            {letter.sorani}
          </span>
        ) : (
          <span className="ab-card-note">{t('alphabet.notWritten')}</span>
        )}
      </div>

      {letter.note === 'long' && <p className="ab-card-note">{t('alphabet.note.long')}</p>}
      {letter.note === 'rolled' && <p className="ab-card-note">{t('alphabet.note.rolled')}</p>}

      <Stepper onStep={onStep} />
    </article>
  );
}

function SoraniCard({ letter, locale, onStep }: { letter: SoraniLetter; locale: AppLocale; onStep: (by: number) => void }): React.JSX.Element {
  const t = useT();
  const like = locale === 'ckb' ? null : soraniLikeFor(letter, locale);
  const forms = formsOf(letter);
  return (
    <article className="ab-card" aria-live="polite">
      <div className="ab-card-head">
        <span className="ab-card-glyph ab-ar" lang="ckb" dir="rtl">
          {letter.char}
        </span>
        <span className="ab-ipa" title={t('alphabet.ipa')} dir="ltr">
          /{letter.ipa}/
        </span>
      </div>
      {locale === 'ar' && letter.kurdishOnly && <p className="ab-badge">{t('alphabet.notInArabic')}</p>}

      {like && (
        <div className="ab-card-row">
          <span className="ab-card-label">{t('alphabet.soundsLike')}</span>
          <Like like={like} />
        </div>
      )}

      {letter.latin && (
        <div className="ab-card-row ab-card-bridge">
          <span className="ab-card-label">{t('alphabet.inKurmanci')}</span>
          <span className="ab-card-partner" lang="ku" dir="ltr">
            {letter.latin}
          </span>
        </div>
      )}

      <div className="ab-card-row">
        <span className="ab-card-label">{t('alphabet.forms')}</span>
        <div className="ab-forms" dir="rtl">
          {(
            [
              ['alone', forms.alone],
              ['start', forms.start],
              ['middle', forms.middle],
              ['end', forms.end],
            ] as const
          ).map(([k, f]) => (
            <span key={k} className="ab-form">
              <span className="ab-ar" lang="ckb">
                {f}
              </span>
              <small>{t(FORM_KEY[k])}</small>
            </span>
          ))}
        </div>
        {!letter.joins && <span className="ab-card-note">{t('alphabet.noJoin')}</span>}
      </div>

      <div className="ab-card-row">
        <span className="ab-card-label">{t('alphabet.rememberBy')}</span>
        <span className="ab-card-word ab-ar" lang="ckb" dir="rtl">
          {letter.word}
        </span>
        <Meaning meaning={letter.meaning} script="ckb" locale={locale} />
      </div>

      {letter.alsoVowel && (
        <p className="ab-card-note">
          {t('alphabet.alsoVowel', { letter: letter.alsoVowel.latin, word: letter.alsoVowel.word })}
        </p>
      )}

      <Stepper onStep={onStep} />
    </article>
  );
}

const FORM_KEY: Record<'alone' | 'start' | 'middle' | 'end', MessageKey> = {
  alone: 'alphabet.form.alone',
  start: 'alphabet.form.start',
  middle: 'alphabet.form.middle',
  end: 'alphabet.form.end',
};

/* ---- check yourself ------------------------------------------------------ */

interface Question {
  /** what is asked about */
  prompt: { kind: 'like'; like: Likeness } | { kind: 'glyph'; text: string; script: Script };
  options: Array<{ id: string; text: string; script: Script }>;
  answer: string;
  /** the letter, as it is named on the review list */
  name: string;
}

const ROUND = 6;

function shuffle<T>(xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Six questions, aimed at the letters that trip people up.
 *
 * Retrieval rather than rereading — recalling a letter is what makes it stay —
 * and low stakes on purpose: nothing is scored, saved or ranked, and a miss
 * answers with the right letter at once rather than a red cross alone.
 */
function makeRound(script: Script, locale: AppLocale): Question[] {
  const lang = compareLocaleOf(locale);
  if (script === 'kmr' && lang) {
    const hard = LATIN.filter((l) => bandOf(l.id, lang) !== 'same');
    const pool = shuffle(hard.length >= ROUND ? hard : [...hard, ...shuffle(LATIN.filter((l) => !hard.includes(l)))]).slice(0, ROUND);
    return pool.map((l) => {
      const others = shuffle(LATIN.filter((o) => o.id !== l.id && o.vowel === l.vowel)).slice(0, 2);
      return {
        prompt: { kind: 'like', like: likeFor(l.id, locale)! },
        options: shuffle([l, ...others]).map((o) => ({ id: o.id, text: o.id, script: 'kmr' })),
        answer: l.id,
        name: l.id,
      };
    });
  }
  // the scripts against each other: Kurmancî letter → Soranî, or the other way for a Soranî reader
  const paired = SORANI.filter((l) => l.latin && !l.extra);
  const toLatin = locale === 'ckb';
  return shuffle(paired)
    .slice(0, ROUND)
    .map((l) => {
      const others = shuffle(paired.filter((o) => o.id !== l.id && o.kind === l.kind)).slice(0, 2);
      const opts = shuffle([l, ...others]);
      return toLatin
        ? {
            prompt: { kind: 'glyph', text: l.char, script: 'ckb' },
            options: opts.map((o) => ({ id: o.id, text: o.latin!, script: 'kmr' })),
            answer: l.id,
            name: l.char,
          }
        : {
            prompt: { kind: 'glyph', text: l.latin!, script: 'kmr' },
            options: opts.map((o) => ({ id: o.id, text: o.char, script: 'ckb' })),
            answer: l.id,
            name: l.latin!,
          };
    });
}

function Practice({ script, locale }: { script: Script; locale: AppLocale }): React.JSX.Element {
  const t = useT();
  const [round, setRound] = useState<Question[] | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);

  const start = (): void => {
    setRound(makeRound(script, locale));
    setAt(0);
    setChosen(null);
    setMissed([]);
  };

  const q = round?.[at];
  const done = round !== null && at >= round.length;
  const question = q
    ? q.prompt.kind === 'like'
      ? t('alphabet.practice.qSound')
      : q.prompt.script === 'kmr'
        ? t('alphabet.practice.qToSorani')
        : t('alphabet.practice.qToLatin')
    : '';

  return (
    <section className="ab-practice" aria-labelledby="ab-practice">
      <h2 className="ab-group-title" id="ab-practice">
        {t('alphabet.practice.title')}
      </h2>

      {!round && (
        <>
          <p className="ab-group-body">{t('alphabet.practice.body')}</p>
          <Button onClick={start}>{t('alphabet.practice.start')}</Button>
        </>
      )}

      {q && (
        <div className="ab-q">
          <p className="ab-q-progress">{t('alphabet.practice.progress', { n: at + 1, total: round!.length })}</p>
          <p className="ab-q-ask">{question}</p>
          <p className="ab-q-prompt">
            {q.prompt.kind === 'like' ? (
              <Like like={q.prompt.like} />
            ) : (
              <span
                className={q.prompt.script === 'ckb' ? 'ab-ar' : undefined}
                lang={q.prompt.script === 'ckb' ? 'ckb' : 'ku'}
              >
                {q.prompt.text}
              </span>
            )}
          </p>
          <div className="ab-q-options">
            {q.options.map((o) => {
              const state = chosen === null ? '' : o.id === q.answer ? ' is-right' : o.id === chosen ? ' is-wrong' : ' is-dim';
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`ab-tile ab-option${state}`}
                  disabled={chosen !== null}
                  onClick={() => {
                    setChosen(o.id);
                    if (o.id !== q.answer) setMissed((m) => [...m, q.name]);
                  }}
                >
                  <span className={`ab-tile-glyph${o.script === 'ckb' ? ' ab-ar' : ''}`} lang={o.script === 'ckb' ? 'ckb' : 'ku'}>
                    {o.text}
                  </span>
                </button>
              );
            })}
          </div>
          {chosen !== null && (
            <div className="ab-q-feedback" role="status">
              <span className={chosen === q.answer ? 'ab-right' : 'ab-wrong'}>
                {chosen === q.answer
                  ? t('alphabet.practice.right')
                  : t('alphabet.practice.wrong', { letter: q.options.find((o) => o.id === q.answer)!.text })}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setAt((n) => n + 1);
                  setChosen(null);
                }}
              >
                {t('alphabet.practice.next')}
              </Button>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="ab-q-done" role="status">
          <p className="ab-q-score">{t('alphabet.practice.score', { right: round!.length - missed.length, total: round!.length })}</p>
          <p className="ab-group-body">
            {missed.length === 0 ? t('alphabet.practice.perfect') : `${t('alphabet.practice.review')} ${missed.join(' · ')}`}
          </p>
          <Button variant="secondary" onClick={start}>
            {t('alphabet.practice.again')}
          </Button>
        </div>
      )}
    </section>
  );
}
