import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
import { HeartIcon, StarIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { HevaloDeer } from './HevaloDeer';
import { sendFeedback } from './api';

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
 * "How are you enjoying Hevalo?", with Hevalo holding up five stars. After a first finished game (`first_game`) it
 * asks for stars first, then "what could be better?" under three or an optional "what do you love?" from three up.
 * From Settings (`settings`) the whole form shows at once with the stars optional.
 *
 * Every answer goes to the admin's inbox and ends with a happy thank-you. Nothing links to a store, since prompting
 * only happy users to rate the app is review gating, which store and consumer rules forbid (shared/src/feedback.ts).
 * "Not now" only closes it; once stars are chosen, every way out sends them, so happy answers reach the inbox too.
 */
export function RatingBox({
  source,
  onClose,
  titleId,
  leaveRef,
}: {
  source: AppFeedbackSource;
  /** `answered`: something was sent or is on its way; `dismissed`: closed with nothing chosen. */
  onClose: (how: 'answered' | 'dismissed') => void;
  /** The id of the question or thank-you heading, which names the surrounding dialog. */
  titleId?: string;
  /** Filled with a leave function for the holder to call on Escape or when the player moves on; it keeps chosen stars. */
  leaveRef?: React.MutableRefObject<(() => void) | null>;
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
  // An answer has gone or is going to the server, so leaving must not send a second.
  const delivered = useRef(false);
  const settings = source === 'settings';
  const followUp = stars > 0 ? feedbackFollowUp(stars) : null;
  const asksImprove = settings || followUp === 'improve';
  const loving = followUp === 'love' && !settings;

  const toggle = (c: AppFeedbackCategory): void =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const trimmed = comment.trim();
  const canSend = settings ? stars > 0 || categories.length > 0 || trimmed.length > 0 : stars > 0;

  // With stars and nothing written, "Done" is the whole answer and just closes.
  const doneOnly = loving && !trimmed;

  async function send(): Promise<void> {
    if (!canSend || sending) return;
    delivered.current = true;
    setSending(true);
    setError(null);
    const res = await sendFeedback(client, {
      ...(stars > 0 ? { stars } : {}),
      // The chips belong to "what could be better?", so a happy answer sends none.
      ...(categories.length > 0 && asksImprove ? { categories } : {}),
      ...(trimmed ? { comment: trimmed } : {}),
      source,
      locale,
    });
    setSending(false);
    if (!res.ok) {
      delivered.current = false;
      setError(describeError(res.error, t));
    } else if (doneOnly) onClose('answered');
    else setSent(true);
  }

  /** Leaving without Send sends any chosen stars and nothing else; a failure is not worth stopping the player for. */
  function leave(): void {
    if (!settings && stars > 0 && !delivered.current) {
      delivered.current = true;
      void sendFeedback(client, { stars, source, locale });
      onClose('answered');
      return;
    }
    onClose(delivered.current ? 'answered' : 'dismissed');
  }
  useLayoutEffect(() => {
    if (leaveRef) leaveRef.current = leave;
  });

  // The form that had focus is gone, so the thank-you takes it and is announced.
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

      {/* The follow-up appears as stars are chosen and is announced. */}
      <p className="rb-follow" aria-live="polite">
        {!settings && followUp === 'improve' ? (
          t('appFeedback.improve')
        ) : loving ? (
          <>
            {t('appFeedback.thanksLove')}
            {/* The heart is drawn in the app's gold. */}
            <HeartIcon size={18} weight="fill" className="rb-heart" />
          </>
        ) : (
          ''
        )}
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
          {/* Below "what could be better?", the box is only "tell us more". */}
          <label className="field-label" htmlFor={`${ids}-comment`}>
            {loving
              ? t('appFeedback.loveLabel')
              : settings
                ? t('appFeedback.improveLabel')
                : t('appFeedback.tellMore')}
          </label>
          <textarea
            id={`${ids}-comment`}
            className="input rb-text"
            value={comment}
            maxLength={APP_FEEDBACK_COMMENT_MAX}
            rows={3}
            placeholder={loving || settings ? t('appFeedback.tellMore') : undefined}
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
            {sending ? t('appFeedback.sending') : doneOnly ? t('appFeedback.done') : t('appFeedback.send')}
          </Button>
        )}
        {/* "Done" stands alone; beside "Send", the way out keeps the stars. */}
        {!settings && !doneOnly && (
          <button type="button" className="btn btn-ghost rb-leave" onClick={leave} disabled={sending}>
            {stars > 0 ? t('common.close') : t('appFeedback.notNow')}
          </button>
        )}
      </div>
    </form>
  );
}
