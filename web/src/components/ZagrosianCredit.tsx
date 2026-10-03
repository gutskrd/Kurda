import { ZAGROSIAN_MARK, ZAGROSIAN_URL, ZAGROSIAN_VIEWBOX } from '../brand/zagrosian';
import { useT } from '../i18n/I18nProvider';

/**
 * Who made this, at the foot of the page.
 *
 * An imprint rather than an advertisement: it sits quiet in the bottom bar at
 * the weight of the copyright line beside it, and only brightens when somebody
 * reaches for it. The mark is drawn in `currentColor`, so it lifts with the
 * words rather than staying lit while they move.
 *
 * The name is not translated — it is a company, and a company is called what it
 * is called in every language. Only the sentence around it changes.
 */
export function ZagrosianCredit(): React.JSX.Element {
  const t = useT();
  return (
    <a className="by-zagrosian" href={ZAGROSIAN_URL} target="_blank" rel="noreferrer noopener">
      <span>{t('footer.byZagrosian')}</span>
      <svg
        className="by-zagrosian-mark"
        viewBox={ZAGROSIAN_VIEWBOX}
        fill="currentColor"
        focusable="false"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d={ZAGROSIAN_MARK} />
      </svg>
    </a>
  );
}
