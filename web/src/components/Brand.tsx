import { Link } from 'react-router-dom';

/** The MyKurda wordmark + the real K/sun logo. Links home. */
export function Brand({ to = '/' }: { to?: string }): React.JSX.Element {
  return (
    <Link to={to} className="brand" aria-label="MyKurda home">
      <img className="brand-mark" src="/logo.png" alt="" aria-hidden="true" />
      <span>MyKurda</span>
    </Link>
  );
}
