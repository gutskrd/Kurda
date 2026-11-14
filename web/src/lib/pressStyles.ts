/**
 * The build's own step for the styles of pressing and pointing (vite.config.ts).
 *
 *   - A pressed look written as `:active` is drawn from the `is-pressed` class
 *     instead, which `press.ts` sets only for a real press: at once for a
 *     mouse, but for a finger only once it is not scrolling, so a scroll that
 *     starts on a button no longer lights it up.
 *   - A look written for `:hover` is kept to screens with a pointer that can
 *     hover. On a touch screen a tap leaves the browser's hover stuck on
 *     whatever was tapped, so a button stayed lit after it was let go.
 *
 * The styles are written the ordinary way; this keeps every one of them, now
 * and later, from lighting anything up that the reader did not press.
 */

/** The little of a stylesheet's tree this step reads and writes. */
interface Node {
  type: string;
  parent?: Container;
  remove(): void;
}
interface Container extends Node {
  nodes?: Node[];
  name?: string;
  params?: string;
  append(...nodes: Node[]): void;
  insertAfter(old: Node, added: Node): void;
}
interface Rule extends Node {
  selector: string;
  selectors: string[];
  clone(overrides?: { selector?: string }): Rule;
}
interface Helpers {
  AtRule: new (props: { name: string; params: string }) => Container;
}

/** A selector's `:active`, as the class `press.ts` sets for a real press. */
export function pressedSelector(selector: string): string {
  return selector.replace(/:active(?![\w-])/g, '.is-pressed');
}

/** Whether a rule already stands under a condition about hovering, which it is then left to. */
function underHoverCondition(rule: Node): boolean {
  for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && /hover/.test(p.params ?? '')) return true;
  return false;
}

export function pressStyles(): { postcssPlugin: string; Rule: (rule: Rule, helpers: Helpers) => void } {
  return {
    postcssPlugin: 'hevalo-press-styles',
    Rule(rule, { AtRule }) {
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name ?? '')) return;
      if (rule.selector.includes(':active')) rule.selector = pressedSelector(rule.selector);
      if (!rule.selector.includes(':hover') || underHoverCondition(rule)) return;
      const hovering = rule.selectors.filter((s) => s.includes(':hover'));
      const rest = rule.selectors.filter((s) => !s.includes(':hover'));
      const media = new AtRule({ name: 'media', params: '(hover: hover)' });
      media.append(rule.clone({ selector: hovering.join(', ') }));
      rule.parent?.insertAfter(rule, media);
      if (rest.length) rule.selector = rest.join(', ');
      else rule.remove();
    },
  };
}
