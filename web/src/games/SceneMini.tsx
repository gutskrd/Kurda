import './scene.css';

/**
 * What Would You Say?'s picture on its card in Learn, and above its intro: a
 * speech bubble heard, and two to answer it with, one lit. Decorative, and
 * drawn without any Kurdish of its own.
 */
export function SceneMini(): React.JSX.Element {
  return (
    <div className="lg-mini ws-mini" aria-hidden>
      <span className="ws-mini-bubble ws-mini-bubble--heard" />
      <span className="ws-mini-bubble ws-mini-bubble--reply" />
      <span className="ws-mini-bubble ws-mini-bubble--reply is-on" />
    </div>
  );
}
