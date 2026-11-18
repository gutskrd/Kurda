/**
 * A PostCSS step in the build (vite.config.ts). `:active` rules become `.is-pressed`, which `press.ts` sets only for a
 * real press, so scrolls do not light up buttons. `:hover` rules apply only under `(hover: hover)`, since a tap leaves
 * hover stuck on touch screens.
 */

/** The part of a stylesheet's tree this step reads and writes. */
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

/** A selector with `:active` replaced by the class `press.ts` sets. */
export function pressedSelector(selector: string): string {
  return selector.replace(/:active(?![\w-])/g, '.is-pressed');
}

/** Whether a rule already sits under a hover media condition, in which case it is left alone. */
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
