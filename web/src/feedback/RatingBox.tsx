import { useEffect, useId, useRef, useState } from 'react';
import {
  APP_FEEDBACK_CATEGORIES,
  APP_FEEDBACK_COMMENT_MAX,
  feedbackFollowUp,
  type AppFeedbackCategory,
  type AppFeedbackSource,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { StarIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { HevaloDeer } from './HevaloDeer';
import { dismissFeedback, sendFeedback } from './api';

const CATEGORY_LABEL: Record<AppFeedbackCategory, MessageKey> = {
  lessons: 'appFeedback.category.lessons',
  games: 'appFeedback.category.games',
  stories: 'appFeedback.category.stories',
  bugs: 'appFeedback.category.bugs',
  too_hard: 'appFeedback.category.tooHard',
  too_easy: 'appFeedback.category.tooEasy',
  other: 'appFeedback.category.other',
};

const STAR_LABEL: MessageKey[] = [
  'appFeedback.stars.1',
  'appFeedback.stars.2',
  'appFeedback.stars.3',
  'appFeedback.stars.4',
  'appFeedback.stars.5',
];

/**
 * "How are you enjoying Hevalo?" — Hevalo the deer holds up a board of five
 * stars (contract §F).
 *
 * After a first finished game (source `first_game`) it asks for the stars
 * first, then: under three, "what could be better?" with a few chips and a
 * box; three and up, a thank-you and an optional "what do you love?". From
 * Settings (source `settings`) it is the same form with everything at once
 * and the stars optional — somebody who opened it has something to say.
 *
 * Every answer goes to the admin's feedback inbox and ends with a thank-you
 * from a deer that is happy whatever the stars were. Nothing here links to a
 * store: sending only the happy ones on to rate the app is review gating,
 * which Apple, Google and the FTC all forbid (shared/src/feedback.ts). "Not
 * now" closes it, and counts as shown.
 */
export function RatingBox({
  source,
  onClose,
  titleId,
}: {
  source: AppFeedbackSource;
  /** `answered`: something was sent; `dismissed`: "Not now" */
  onClose: (how: 'answered' | 'dismissed') => void;
  /** the id the question (or the thank-you) heading takes, for the dialog around it to name itself by */
  titleId?: string;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const { locale } = useI18n();
  const ids = useId();
  const headingId = titleId ?? `${ids}-title`;
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [categories, setCategories] = useState<AppFeedbackCategory[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  const settings = source === 'settings';
  const followUp = stars > 0 ? feedbackFollowUp(stars) : null;
  const asksImprove = settings || followUp === 'improve';
  const loving = followUp === 'love' && !settings;

  const toggle = (c: AppFeedbackCategory): void =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const trimmed = comment.trim();
  const canSend = settings ? stars > 0 || categories.length > 0 || trimmed.length > 0 : stars > 0;

  async function send(): Promise<void> {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    const res = await sendFeedback(client, {
      ...(stars > 0 ? { stars } : {}),
      // the chips belong to "what could be better?", so a happy answer sends none
      ...(categories.length > 0 && asksImprove ? { categories } : {}),
      ...(trimmed ? { comment: trimmed } : {}),
      source,
      locale,
    });
    setSending(false);
    if (res.ok) setSent(true);
    else setError(describeError(res.error, t));
  }

  function notNow(): void {
    // counts as shown on every device; should this fail, the box may ask
    // again some day, which is harmless
    if (!settings) void dismissFeedback(client);
    onClose('dismissed');
  }

  // the form the focus was in is gone; the thank-you takes it, and is read out
  useEffect(() => {
    if (sent) thanksRef.current?.focus();
  }, [sent]);

  if (sent) {
    return (
      <div className="rb rb-done">
        <HevaloDeer size={128} board={{ kind: 'stars', stars: Math.max(stars, 4) }} />
        <h2 className="rb-title" id={headingId} tabIndex={-1} ref={thanksRef}>
          {t('appFeedback.thanksRead')}
        </h2>
        <Button onClick={() => onClose('answered')}>{t('common.close')}</Button>
      </div>
    );
  }

  const shown = hover || stars;
  return (
    <form
      className="rb"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="rb-head">
        <HevaloDeer size={settings ? 112 : 128} board={{ kind: 'stars', stars: shown }} />
        <div className="rb-head-text">
          <h2 className="rb-title" id={headingId}>
            {settings ? t('appFeedback.settingsTitle') : t('appFeedback.question')}
          </h2>
          {settings && <p className="rb-lead" id={`${ids}-lead`}>{t('appFeedback.question')}</p>}
        </div>
      </div>

      <div
        className="rb-stars"
        role="radiogroup"
        aria-labelledby={settings ? `${ids}-lead` : headingId}
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`rb-star${n <= shown ? ' is-on' : ''}`} onMouseEnter={() => setHover(n)}>
            <input
              type="radio"
              className="rb-star-input"
              name={`${ids}-stars`}
              value={n}
              checked={stars === n}
              onChange={() => setStars(n)}
            />
            <StarIcon size={34} weight={n <= shown ? 'fill' : 'regular'} />
            <span className="sr-only">{t(STAR_LABEL[n - 1]!)}</span>
          </label>
        ))}
      </div>

      {/* the follow-up appears as the stars are chosen; a screen reader hears it */}
      <p className="rb-follow" aria-live="polite">
        {!settings && followUp === 'improve' ? t('appFeedback.improve') : loving ? t('appFeedback.thanksLove') : ''}
      </p>

      {asksImprove && (
        <fieldset className="rb-chips">
          <legend className="sr-only">{t('appFeedback.categoriesLabel')}</legend>
          {APP_FEEDBACK_CATEGORIES.map((c) => (
            <label key={c} className={`chip rb-chip${categories.includes(c) ? ' active' : ''}`}>
              <input type="checkbox" className="rb-chip-input" checked={categories.includes(c)} onChange={() => toggle(c)} />
              {t(CATEGORY_LABEL[c])}
            </label>
          ))}
        </fieldset>
      )}

      {(settings || followUp) && (
        <div className="rb-comment">
          <label className="field-label" htmlFor={`${ids}-comment`}>
            {loving ? t('appFeedback.loveLabel') : t('appFeedback.improveLabel')}
          </label>
          <textarea
            id={`${ids}-comment`}
            className="input rb-text"
            value={comment}
            maxLength={APP_FEEDBACK_COMMENT_MAX}
            rows={3}
            placeholder={t('appFeedback.improvePlaceholder')}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      )}

      {error && (
        <div className="msg msg-error rb-error" role="alert">
          {error}
        </div>
      )}

      <div className="rb-actions">
        {(settings || followUp) && (
          <Button type="submit" disabled={!canSend || sending} aria-busy={sending}>
            {sending ? t('appFeedback.sending') : loving && !trimmed ? t('appFeedback.done') : t('appFeedback.send')}
          </Button>
        )}
        {!settings && (
          <button type="button" className="btn btn-ghost rb-not-now" onClick={notNow}>
            {t('appFeedback.notNow')}
          </button>
        )}
      </div>
    </form>
  );
}
