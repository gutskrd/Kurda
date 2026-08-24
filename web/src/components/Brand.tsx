import { Link } from 'react-router-dom';
import { BrandMark } from './icons';

/** The MyKurda wordmark + sun mark. Links home unless `as="span"`. */
export function Brand({ to = '/' }: { to?: string }): React.JSX.Element {
  return (
    <Link to={to} className="brand" aria-label="MyKurda home">
      <BrandMark size={26} className="brand-mark" />
      <span>MyKurda</span>
    </Link>
  );
}
