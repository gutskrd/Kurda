import { HeartIcon } from '../components/icons';
import { timeLabel } from '../chat/messageGroups';
import { useLocale, useT } from '../i18n/I18nProvider';

/**
 * A one-tap thanks for a gift, drawn as a quiet line across the thread with a heart, so it never reads as words someone
 * typed: "Rojda said thanks for Gul", or "You said thanks for Gul". A thanks from before the app knew its gift names
 * the gift plainly. Like a bubble, it keeps its time for hover and screen readers, so the line stays on one row.
 */
export function ThanksLine({ mine, name, gift, at }: { mine: boolean; name: string; gift: string | null; at: string }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const what = gift ?? t('gift.thanksLine.theGift');
  return (
    <p className="thanks-line">
      <span className="thanks-line-mark" aria-hidden="true">
        <HeartIcon size={14} weight="fill" />
      </span>
      <span className="thanks-line-text">{mine ? t('gift.thanksLine.mine', { gift: what }) : t('gift.thanksLine.theirs', { name, gift: what })}</span>
      <time className="sr-only" dateTime={at}>
        {timeLabel(at, locale)}
      </time>
    </p>
  );
}
