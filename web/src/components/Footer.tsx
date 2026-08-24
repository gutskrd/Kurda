import { Link } from 'react-router-dom';
import { Brand } from './Brand';

export function Footer(): React.JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div style={{ maxWidth: 280 }}>
            <Brand />
            <p className="muted" style={{ marginTop: 12, fontSize: '0.92rem' }}>
              A beautiful way to learn Kurdish — lessons, stories, poems and play.
            </p>
            <p className="kurdish" style={{ marginTop: 10 }}>
              Jiyan bi kurdî xweştire.
            </p>
          </div>

          <div className="footer-col">
            <h4>Learn</h4>
            <Link to="/learn">Lessons</Link>
            <Link to="/stories">Stories</Link>
            <Link to="/poems">Poems</Link>
            <Link to="/games">Games</Link>
          </div>

          <div className="footer-col">
            <h4>Community</h4>
            <Link to="/rankings">Rankings</Link>
            <Link to="/register">Join MyKurda</Link>
            <Link to="/login">Log in</Link>
          </div>

          <div className="footer-col">
            <h4>App</h4>
            <a href="https://apps.apple.com/" target="_blank" rel="noreferrer noopener">
              iOS (coming soon)
            </a>
            <a href="https://play.google.com/" target="_blank" rel="noreferrer noopener">
              Android (coming soon)
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} MyKurda</span>
          <span className="muted">Made with care for the Kurdish language.</span>
        </div>
      </div>
    </footer>
  );
}
