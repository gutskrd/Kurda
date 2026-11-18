import { ZAGROSIAN_MARK, ZAGROSIAN_URL, ZAGROSIAN_VIEWBOX } from '../brand/zagrosian';
import { useT } from '../i18n/I18nProvider';

/**
 * The maker's imprint in the bottom bar, at the copyright line's weight, brightening on hover; the mark uses
 * `currentColor` so it lifts with the words. The company name is not translated.
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
