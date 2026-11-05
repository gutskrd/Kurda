import { PinIcon } from '../components/icons';
import './detective.css';

/**
 * Kurdish Detective's picture on its card in Learn, and above its intro:
 * three cards pinned to a board at a slant, one of them circled. Decorative,
 * and drawn without any Kurdish of its own.
 */
export function CaseMini(): React.JSX.Element {
  return (
    <div className="lg-mini dt-mini" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`dt-mini-card${i === 1 ? ' is-on' : ''}`}>
          <PinIcon size={14} />
          <span className="dt-mini-line" />
          <span className="dt-mini-line is-short" />
        </span>
      ))}
    </div>
  );
}
