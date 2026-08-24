import { LinkButton } from '../components/Button';

export function NotFound(): React.JSX.Element {
  return (
    <div className="container" style={{ padding: '96px 24px', textAlign: 'center' }}>
      <span className="eyebrow">404</span>
      <h1 className="display" style={{ marginTop: 12, fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
        Page not found
      </h1>
      <p className="lead" style={{ margin: '16px auto 30px', maxWidth: '44ch' }}>
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <LinkButton to="/" size="lg">
        Back home
      </LinkButton>
    </div>
  );
}
