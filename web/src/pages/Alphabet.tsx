import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '@fontsource-variable/vazirmatn';
import type { AppLocale } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useMediaQuery } from '../lib/useMediaQuery';
import { publishedDictionary } from '../layouts/navLinks';
import { isSynthesised, latinSound, latinWord, play, soraniSound, soraniWord, useRecordings } from '../alphabet/audio';
import { Practice } from '../alphabet/Practice';
import { Sound } from '../alphabet/Sound';
import { Meaning } from '../alphabet/Meaning';
import {
  LATIN,
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

/** What a tile says under its letter: the sound it is like, or its partner in the other script. */
function latinHint(l: LatinLetter, locale: AppLocale): string | null {
  const lang = compareLocaleOf(locale);
  if (!lang) return l.sorani;
  if (bandOf(l.id, lang) === 'same') return null;
  // a vowel's comparison marks the same letter ("f[a]ther"); repeating it under the tile says nothing
  const sound = likeFor(l.id, locale)?.sound ?? null;
  return sound && sound.toLocaleLowerCase() !== l.id ? sound : null;
}

/**
 * Which letters this reader has opened, per alphabet — in this browser only,
 * never sent anywhere. Seeing the ticks add up is the small, honest kind of
 * progress that keeps someone going (and storage that fails just means no ticks).
 */
const SEEN_KEY = 'hevalo_alphabet_seen';

function readSeen(): Record<Script, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Partial<Record<Script, unknown>>;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { kmr: list(raw.kmr), ckb: list(raw.ckb) };
  } catch {
    return { kmr: [], ckb: [] };
  }
}

function useSeen(script: Script): [Set<string>, (id: string) => void] {
  const [all, setAll] = useState(readSeen);
  const mark = (id: string): void =>
    setAll((prev) => {
      if (prev[script].includes(id)) return prev;
      const next = { ...prev, [script]: [...prev[script], id] };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // private mode or full storage: the ticks just do not persist
      }
      return next;
    });
  return [useMemo(() => new Set(all[script]), [all, script]), mark];
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

  const [seen, markSeen] = useSeen(script);
  // hearing it the moment you tap is the point of tapping: sound and shape, together
  const open = (id: string): void => {
    setPicked(id);
    markSeen(id);
    const sorani = script === 'ckb' ? SORANI.find((l) => l.id === id) : undefined;
    const clip = sorani ? soraniSound(sorani) : latinSound(id);
    if (clip) play(clip);
  };
  const pick = (id: string): void => {
    open(id);
    if (!wide) setSheet(true);
  };
  const step = (by: number): void => {
    const i = order.indexOf(current);
    open(order[(i + by + order.length) % order.length]!);
  };
  const explored = order.filter((id) => seen.has(id)).length;
  const progress = (
    <div className={`ab-progress${explored === order.length ? ' is-done' : ''}`}>
      <div className="ab-progress-track" aria-hidden="true">
        <span style={{ width: `${(explored / order.length) * 100}%` }} />
      </div>
      <span className="ab-progress-text" aria-live="polite">
        {explored === order.length
          ? t('alphabet.exploredAll', { total: order.length })
          : t('alphabet.explored', { n: explored, total: order.length })}
      </span>
    </div>
  );

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
              {progress}
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
                          className={`ab-tile${current === l.id ? ' is-on' : ''}${seen.has(l.id) ? ' is-seen' : ''}`}
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
              {progress}
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
                        className={`ab-tile${current === l.id ? ' is-on' : ''}${seen.has(l.id) ? ' is-seen' : ''}${locale === 'ar' && l.kurdishOnly ? ' is-kurdish' : ''}`}
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

          <Practice key={script} script={script} locale={locale} onOpen={pick} />

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
  useRecordings();
  const like = likeFor(letter.id, locale);
  const synthetic = [latinSound(letter.id), latinWord(letter.id)].some(isSynthesised);
  return (
    <article className="ab-card" aria-live="polite">
      <div className="ab-card-head">
        <span className="ab-card-glyph" lang="ku" dir="ltr">
          {letter.upper}
          <small>{letter.id}</small>
        </span>
        <span className="ab-card-tools">
          <Sound src={latinSound(letter.id)} label={t('alphabet.listen')} size="lg" />
          <span className="ab-ipa" title={t('alphabet.ipa')} dir="ltr">
            /{letter.ipa}/
          </span>
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
        <span className="ab-card-word-row">
          <span className="ab-card-word" dir="ltr">
            <KurdishWord word={letter.word} letter={letter.id} />
          </span>
          <Sound src={latinWord(letter.id)} label={t('alphabet.listenWord')} />
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
      {synthetic && <p className="ab-voice-note">{t('alphabet.voiceNote')}</p>}
    </article>
  );
}

function SoraniCard({ letter, locale, onStep }: { letter: SoraniLetter; locale: AppLocale; onStep: (by: number) => void }): React.JSX.Element {
  const t = useT();
  useRecordings();
  const like = locale === 'ckb' ? null : soraniLikeFor(letter, locale);
  const synthetic = [soraniSound(letter), soraniWord(letter)].some(isSynthesised);
  const forms = formsOf(letter);
  return (
    <article className="ab-card" aria-live="polite">
      <div className="ab-card-head">
        <span className="ab-card-glyph ab-ar" lang="ckb" dir="rtl">
          {letter.char}
        </span>
        <span className="ab-card-tools">
          <Sound src={soraniSound(letter)} label={t('alphabet.listen')} size="lg" />
          <span className="ab-ipa" title={t('alphabet.ipa')} dir="ltr">
            /{letter.ipa}/
          </span>
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
        <span className="ab-card-word-row">
          <span className="ab-card-word ab-ar" lang="ckb" dir="rtl">
            {letter.word}
          </span>
          <Sound src={soraniWord(letter)} label={t('alphabet.listenWord')} />
        </span>
        <Meaning meaning={letter.meaning} script="ckb" locale={locale} />
      </div>

      {letter.alsoVowel && (
        <p className="ab-card-note">
          {t('alphabet.alsoVowel', { letter: letter.alsoVowel.latin, word: letter.alsoVowel.word })}
        </p>
      )}

      <Stepper onStep={onStep} />
      {synthetic && <p className="ab-voice-note">{t('alphabet.voiceNote')}</p>}
    </article>
  );
}

const FORM_KEY: Record<'alone' | 'start' | 'middle' | 'end', MessageKey> = {
  alone: 'alphabet.form.alone',
  start: 'alphabet.form.start',
  middle: 'alphabet.form.middle',
  end: 'alphabet.form.end',
};
