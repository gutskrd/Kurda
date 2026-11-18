import { describe, expect, it } from 'vitest';
import postcss, { type Declaration, type Root, type Rule } from 'postcss';
import { HAND_TUNED, LARGE_ENOUGH, REACH_CONTROLS, SCROLLERS, STANDALONE_LINKS } from './reach';

/*
 * Holds every stylesheet to the lists in reach.ts: the reach stylesheet names exactly the listed controls with the
 * right tokens, no listed control has another `::before` (the reach is that pseudo-element), and none clips its own
 * overflow. Stylesheets are read from disk because an imported one arrives empty in tests.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
  readdirSync(dir: URL, options: { recursive: true }): string[];
}
const fileSystem = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// The app's sources wherever the suite runs from; kept in a variable so the build does not treat it as an asset.
const here = import.meta.url;
const src = new URL('../', here);

const read = (path: string): string => readFileSync(new URL(path, src), 'utf8');
const sheets = readdirSync(src, { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => p.endsWith('.css'))
  .sort();
const parsed = new Map<string, Root>(sheets.map((p) => [p, postcss.parse(read(p), { from: p })]));
const reachSheet = parsed.get('styles/reach.css')!;

/** Scrolling rows still waiting for their room; each must still fall short, and leaves the list once fixed. */
const ROOM_AWAITED = new Set<string>();
/** Controls whose old hand-made `::after` area still has to go. */
const AFTER_AWAITED = new Set<string>();

/** Rows that keep less room, and why: the shop's item tabs fade out, and more room would take presses meant for the gift picker. */
const ROOM_HELD = new Map<string, number>([['.item-tabs', 4]]);
/** The room above and below every other scrolling row: the most a 32px control reaches under a finger. */
const ROOM = 8;

/** Splits a selector list on its own commas, leaving those inside brackets and parentheses alone. */
function splitList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(list.slice(from).trim());
  return out.filter(Boolean);
}

/** The selectors inside each `:where(…)` of a selector, in order. */
function whereGroups(selector: string): string[][] {
  const groups: string[][] = [];
  for (let at = selector.indexOf(':where('); at !== -1; at = selector.indexOf(':where(', at + 1)) {
    let depth = 0;
    for (let i = at + ':where'.length; i < selector.length; i++) {
      if (selector[i] === '(') depth++;
      else if (selector[i] === ')' && --depth === 0) {
        groups.push(splitList(selector.slice(at + ':where('.length, i)));
        break;
      }
    }
  }
  return groups;
}

/** A selector's compounds between combinators: `.a > .b:hover .c` is `.a`, `.b:hover`, `.c`. */
function compounds(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let part = '';
  for (const c of selector) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (part) out.push(part);
      part = '';
    } else part += c;
  }
  if (part) out.push(part);
  return out;
}

/** What a compound says of the element itself, without arguments about other elements or attribute values. */
function ownPart(compound: string): string {
  let out = '';
  let skip = 0;
  for (let i = 0; i < compound.length; i++) {
    if (skip === 0 && /^:(not|has)\(/.test(compound.slice(i))) {
      skip = 1;
      i = compound.indexOf('(', i);
      continue;
    }
    const c = compound[i];
    if (skip > 0) {
      if (c === '(') skip++;
      else if (c === ')') skip--;
      continue;
    }
    out += c;
  }
  return out.replace(/\[[^\]]*\]/g, '');
}

interface Compound {
  tag: string | null;
  classes: string[];
  before: boolean;
  after: boolean;
}

function readCompound(compound: string): Compound {
  const own = ownPart(compound);
  return {
    tag: /^[a-z][\w-]*/i.exec(own)?.[0].toLowerCase() ?? null,
    classes: [...own.matchAll(/\.(-?[_a-z][\w-]*)/gi)].map((m) => m[1]!),
    before: /::?before\b/.test(own),
    after: /::?after\b/.test(own),
  };
}

/** Whether a selector stands for an element the entry (`.btn`, `.request-name.is-link`, `.auth-alt a`) describes. */
function describes(entry: string, selector: string): boolean {
  const want = compounds(entry).map(readCompound);
  const have = compounds(selector).map(readCompound);
  const fits = (w: Compound, h: Compound): boolean => (w.tag === null || w.tag === h.tag) && w.classes.every((c) => h.classes.includes(c));
  const last = have[have.length - 1];
  if (!last || !fits(want[want.length - 1]!, last)) return false;
  // The entry's ancestor parts, found in order among the selector's.
  let at = 0;
  for (const w of want.slice(0, -1)) {
    while (at < have.length - 1 && !fits(w, have[at]!)) at++;
    if (at >= have.length - 1) return false;
    at++;
  }
  return true;
}

/** Every rule of a sheet with the conditions it stands under, keyframes left out. */
function rulesOf(root: Root): Array<{ rule: Rule; media: string[] }> {
  const out: Array<{ rule: Rule; media: string[] }> = [];
  root.walkRules((rule) => {
    const media: string[] = [];
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule' && 'name' in p) {
        if (/keyframes$/.test(String(p.name))) return;
        if (p.name === 'media') media.unshift(String(p.params));
      }
    }
    out.push({ rule, media });
  });
  return out;
}

const declarations = (rule: Rule): Declaration[] => (rule.nodes ?? []).filter((n): n is Declaration => n.type === 'decl');
/** Where a rule is written: sheet path and line. */
const where = (rule: Rule, path: string): string => `${path}:${rule.source?.start?.line ?? '?'}`;

const LISTED = [...REACH_CONTROLS, ...STANDALONE_LINKS] as string[];

describe('the helpers these checks read the stylesheets with', () => {
  it('splits a list on its own commas only', () => {
    expect(splitList('.a, .b:is(.c, .d), [x="1,2"]')).toEqual(['.a', '.b:is(.c, .d)', '[x="1,2"]']);
  });

  it('finds the lists inside where', () => {
    expect(whereGroups(':root.x :where(.a, .b)::before')).toEqual([['.a', '.b']]);
  });

  it('knows which element a selector stands for', () => {
    expect(describes('.btn', '.card .btn.btn-sm::before')).toBe(true);
    expect(describes('.btn', '.btn .icon::before')).toBe(false);
    expect(describes('.btn', '.btn-primary::before')).toBe(false);
    expect(describes('.btn', '.row:not(.btn) > .icon')).toBe(false);
    expect(describes('.request-name.is-link', '.request-name.is-link:hover')).toBe(true);
    expect(describes('.request-name.is-link', '.request-name')).toBe(false);
    expect(describes('.auth-alt a', '.auth-alt p > a::before')).toBe(true);
    expect(describes('.auth-alt a', '.card a::before')).toBe(false);
    expect(readCompound('.chip::before').before).toBe(true);
    expect(readCompound('.chip::after').before).toBe(false);
  });
});

describe('the lists of what reaches', () => {
  it('name each class once, in one list only', () => {
    const all = [...REACH_CONTROLS, ...STANDALONE_LINKS, ...HAND_TUNED, ...LARGE_ENOUGH] as string[];
    const twice = all.filter((c, i) => all.indexOf(c) !== i);
    expect(twice).toEqual([]);
  });

  it('keep the hand-tuned controls out of the reach altogether', () => {
    const tuned = HAND_TUNED as readonly string[];
    expect(LISTED.filter((c) => tuned.includes(c))).toEqual([]);
    // Nor by a class the hand-tuned control also carries.
    expect(LISTED.filter((c) => HAND_TUNED.some((t) => describes(c, t)))).toEqual([]);
  });

  it('name scrolling rows that do scroll sideways in some stylesheet', () => {
    const scrolling = (rule: Rule): boolean => declarations(rule).some((d) => /^overflow(-x|-inline)?$/.test(d.prop) && /\b(auto|scroll)\b/.test(d.value));
    for (const row of SCROLLERS) {
      const found = [...parsed.values()].some((root) => rulesOf(root).some(({ rule }) => scrolling(rule) && rule.selectors.some((s) => describes(row, s))));
      expect(found, row).toBe(true);
    }
  });
});

describe('the reach, as the stylesheet writes it', () => {
  const top = rulesOf(reachSheet).filter(({ media }) => media.length === 0);
  const coarse = rulesOf(reachSheet).filter(({ media }) => media.join(' ') === '(any-pointer: coarse)');
  const group = (rule: Rule): string[] => whereGroups(rule.selector)[0] ?? [];
  const find = (rules: typeof top, list: readonly string[], before: boolean): Rule | undefined =>
    rules.find(({ rule }) => rule.selector.startsWith(':where(') && /::before$/.test(rule.selector) === before && group(rule).join() === list.join())?.rule;

  it('gives every control in the list, and only those, an anchor and a reach', () => {
    const anchor = find(top, REACH_CONTROLS, false);
    expect(anchor, 'the anchor rule').toBeDefined();
    expect(declarations(anchor!).map((d) => `${d.prop}: ${d.value}`)).toEqual(['position: relative']);
    expect(find(top, REACH_CONTROLS, true), 'the reach rule').toBeDefined();
  });

  it('gives the links on lines of their own a reach only where a finger is about, the same one the controls have', () => {
    expect(find(coarse, STANDALONE_LINKS, false), 'their anchor').toBeDefined();
    const links = find(coarse, STANDALONE_LINKS, true);
    const controls = find(top, REACH_CONTROLS, true);
    expect(links, 'their reach').toBeDefined();
    const said = (rule: Rule): string[] => declarations(rule).map((d) => `${d.prop}: ${d.value}`);
    expect(said(links!)).toEqual(said(controls!));
    // With a mouse there is no reach: outside that condition they are named only where areas are tinted.
    const named = top.filter(({ rule }) => whereGroups(rule.selector).some((g) => g.some((s) => (STANDALONE_LINKS as readonly string[]).includes(s))));
    expect(named.map(({ rule }) => rule.selector.split(/\s/)[0])).toEqual([':root.show-reach']);
  });

  it('reaches to the least area, or the open reach, and never past half the room on either axis', () => {
    const reach = declarations(find(top, REACH_CONTROLS, true)!);
    const value = (prop: string): string | undefined => reach.find((d) => d.prop === prop)?.value;
    expect(value('content')).toBe("''");
    expect(value('position')).toBe('absolute');
    expect(value('inset-block')).toBe('max(calc(var(--reach-room-y, 64px) / -2), min(calc(-1 * var(--reach-open)), calc((100% - var(--reach-min)) / 2)))');
    expect(value('inset-inline')).toBe('max(calc(var(--reach-room-x, 64px) / -2), min(calc(-1 * var(--reach-open)), calc((100% - var(--reach-min)) / 2)))');
  });

  it('tints exactly what reaches, for whoever is building a page', () => {
    const tint = top.find(({ rule }) => rule.selector.startsWith(':root.show-reach'))?.rule;
    expect(tint).toBeDefined();
    expect(group(tint!)).toEqual(LISTED);
  });

  it('weighs nothing, so that every control keeps its own rules', () => {
    for (const { rule } of rulesOf(reachSheet)) {
      for (const s of rule.selectors) expect(s.replace(/^:root\.show-reach\s+/, ''), s).toMatch(/^:where\(/);
    }
  });
});

describe('the sizes the reach is measured in', () => {
  const tokens = parsed.get('styles/tokens.css')!;
  const rootValue = (prop: string, media: string): string | undefined =>
    rulesOf(tokens)
      .filter(({ rule, media: m }) => rule.selector === ':root' && m.join(' ') === media)
      .flatMap(({ rule }) => declarations(rule))
      .find((d) => d.prop === prop)?.value;

  it('is 44px with a mouse, and 48px where any pointer is a finger', () => {
    expect(rootValue('--reach-min', '')).toBe('44px');
    expect(rootValue('--reach-min', '(any-pointer: coarse)')).toBe('48px');
  });

  it('gives nothing past the least area unless a control asks for it', () => {
    expect(rootValue('--reach-open', '')).toBe('0px');
  });
});

/** Rules elsewhere that give a listed control its own `::before`, which would undo its reach. */
function ownBefores(roots: Iterable<[string, Root]>): string[] {
  const taken: string[] = [];
  for (const [path, root] of roots) {
    for (const { rule } of rulesOf(root)) {
      for (const s of rule.selectors) {
        const parts = compounds(s);
        if (!readCompound(parts[parts.length - 1] ?? '').before) continue;
        for (const entry of LISTED) if (describes(entry, s)) taken.push(`${where(rule, path)} ${s} (${entry})`);
      }
    }
  }
  return taken;
}

/** Rules that make a listed control clip its overflow, by entry. */
function clippers(roots: Iterable<[string, Root]>): Array<{ entry: string; at: string }> {
  const clips = (d: Declaration): boolean =>
    (/^overflow(-x|-y|-inline|-block)?$/.test(d.prop) && /\b(hidden|clip|auto|scroll)\b/.test(d.value)) ||
    (d.prop === 'contain' && /\b(paint|strict|content)\b/.test(d.value)) ||
    (d.prop === 'clip-path' && d.value !== 'none');
  const found: Array<{ entry: string; at: string }> = [];
  for (const [path, root] of roots) {
    for (const { rule } of rulesOf(root)) {
      const clip = declarations(rule).find(clips);
      if (!clip) continue;
      for (const s of rule.selectors) {
        const parts = compounds(s);
        // A rule for a pseudo-element clips that, not the control.
        if (/::/.test(parts[parts.length - 1] ?? '')) continue;
        for (const entry of LISTED) if (describes(entry, s)) found.push({ entry, at: `${where(rule, path)} ${s}: ${clip.prop}: ${clip.value}` });
      }
    }
  }
  return found;
}

/** Rules that give a listed control an `::after` past its edges, a hand-made area from before the reach. */
function afterReaches(roots: Iterable<[string, Root]>): Array<{ entry: string; at: string }> {
  const side = /^(inset(-block|-inline)?(-start|-end)?|top|right|bottom|left)$/;
  const found: Array<{ entry: string; at: string }> = [];
  for (const [path, root] of roots) {
    for (const { rule } of rulesOf(root)) {
      const out = declarations(rule).find((d) => side.test(d.prop) && words(d.value).some((w) => (px(w) ?? 0) < 0));
      if (!out) continue;
      for (const s of rule.selectors) {
        const parts = compounds(s);
        if (!readCompound(parts[parts.length - 1] ?? '').after) continue;
        for (const entry of LISTED) if (describes(entry, s)) found.push({ entry, at: `${where(rule, path)} ${s}: ${out.prop}: ${out.value}` });
      }
    }
  }
  return found;
}

/** The `:root` tokens (styles/tokens.css) as written, to resolve lengths that name one. */
const TOKENS = new Map(
  rulesOf(parsed.get('styles/tokens.css')!)
    .filter(({ rule, media }) => rule.selector === ':root' && media.length === 0)
    .flatMap(({ rule }) => declarations(rule))
    .filter((d) => d.prop.startsWith('--'))
    .map((d) => [d.prop, d.value] as const),
);

/** Splits a value on its own spaces, leaving those inside brackets alone: `calc(2px + 8px) 16px` is two words. */
function words(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let word = '';
  for (const c of value.trim()) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (depth === 0 && /\s/.test(c)) {
      if (word) out.push(word);
      word = '';
    } else word += c;
  }
  if (word) out.push(word);
  return out;
}

/** Plain arithmetic with brackets: a `calc()` once its lengths are numbers. */
function arithmetic(text: string): number | undefined {
  const tokens = text.match(/\d*\.?\d+|[-+*/()]/g) ?? [];
  if (tokens.join('') !== text.replace(/\s+/g, '')) return undefined;
  let at = 0;
  const factor = (): number => {
    const t = tokens[at++];
    if (t === '(') {
      const v = sum();
      return tokens[at++] === ')' ? v : NaN;
    }
    if (t === '-') return -factor();
    if (t === '+') return factor();
    return t === undefined ? NaN : Number(t);
  };
  const product = (): number => {
    let v = factor();
    while (tokens[at] === '*' || tokens[at] === '/') v = tokens[at++] === '*' ? v * factor() : v / factor();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (tokens[at] === '+' || tokens[at] === '-') v = tokens[at++] === '+' ? v + product() : v - product();
    return v;
  };
  const v = sum();
  return at === tokens.length && Number.isFinite(v) ? v : undefined;
}

/** A length in px from px, a token or calc(); undefined for what a stylesheet alone cannot say (auto, %, em). */
function px(value: string, depth = 0): number | undefined {
  if (depth > 8) return undefined;
  let known = true;
  const text = value
    .trim()
    .replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fallback?: string) => {
      const held = TOKENS.get(name) ?? fallback;
      const n = held === undefined ? undefined : px(held, depth + 1);
      if (n === undefined) known = false;
      return `(${n ?? 0})`;
    })
    .replace(/calc\(/g, '(')
    .replace(/(\d)px\b/g, '$1');
  return known && !/[a-z%]/i.test(text) ? arithmetic(text) : undefined;
}

/** The top and bottom of a padding or margin declaration; the site is horizontal, so block start is top. */
function blockSides(d: Declaration, box: 'padding' | 'margin'): { top?: string; bottom?: string } {
  const w = words(d.value);
  if (d.prop === box) return { top: w[0], bottom: w[2] ?? w[0] };
  if (d.prop === `${box}-block`) return { top: w[0], bottom: w[1] ?? w[0] };
  if (d.prop === `${box}-top` || d.prop === `${box}-block-start`) return { top: w[0] };
  if (d.prop === `${box}-bottom` || d.prop === `${box}-block-end`) return { bottom: w[0] };
  return {};
}

/** Selector specificity: ids, then classes, attributes and states, then tags. */
function weight(selector: string): number {
  const own = selector.replace(/:where\([^)]*\)/g, '');
  const ids = (own.match(/#[\w-]+/g) ?? []).length;
  const classes = (own.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):[\w-]+/g) ?? []).length;
  const tags = (own.match(/(?:^|[\s>+~(])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10_000 + classes * 100 + tags;
}

/**
 * A scrolling row's padding and top margin in px under each rule that makes it scroll sideways, after the cascade of
 * the rules it stands on; 0 where unset and undefined where a stylesheet alone cannot say.
 */
function scrollerBoxes(row: string, roots: Iterable<[string, Root]>): Array<{ at: string; top?: number; bottom?: number; marginTop?: number }> {
  const placed: Array<{ rule: Rule; path: string; conditions: string[]; weight: number; order: number }> = [];
  for (const [path, root] of roots) {
    root.walkRules((rule) => {
      const conditions: string[] = [];
      for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
        if (p.type === 'atrule' && 'name' in p) {
          if (/keyframes$/.test(String(p.name))) return;
          conditions.unshift(`${String(p.name)} ${String(p.params)}`);
        }
      }
      const mine = rule.selectors.filter((s) => !/::/.test(compounds(s).pop() ?? '') && describes(row, s));
      if (mine.length > 0) placed.push({ rule, path, conditions, weight: Math.max(...mine.map(weight)), order: placed.length });
    });
  }
  const boxes: Array<{ at: string; top?: number; bottom?: number; marginTop?: number }> = [];
  for (const r of placed) {
    const under = placed
      .filter((q) => q === r || (q.conditions.every((c) => r.conditions.includes(c)) && (q.weight < r.weight || (q.weight === r.weight && q.order < r.order))))
      .sort((a, b) => a.weight - b.weight || a.order - b.order);
    let scrolls = false;
    let top = '0';
    let bottom = '0';
    let marginTop = '0';
    for (const q of under) {
      for (const d of declarations(q.rule)) {
        if (/^overflow(-x|-inline)?$/.test(d.prop)) scrolls = /^(auto|scroll)$/.test(words(d.value)[0] ?? '');
        const pad = blockSides(d, 'padding');
        top = pad.top ?? top;
        bottom = pad.bottom ?? bottom;
        marginTop = blockSides(d, 'margin').top ?? marginTop;
      }
    }
    if (scrolls) boxes.push({ at: where(r.rule, r.path), top: px(top), bottom: px(bottom), marginTop: px(marginTop) });
  }
  return boxes;
}

describe('the rest of the stylesheets', () => {
  const others = [...parsed].filter(([path]) => path !== 'styles/reach.css');
  const sheet = (css: string): Array<[string, Root]> => [['known.css', postcss.parse(css, { from: 'known.css' })]];

  it('leave every listed control’s ::before to the reach', () => {
    expect(ownBefores(others)).toEqual([]);
  });

  it('let no listed control clip what reaches past its own edges', () => {
    // The segments and the landing page's tabs too, now that their words clip in spans of their own.
    expect(clippers(others).map(({ at }) => at)).toEqual([]);
  });

  it('give no listed control a hand-made area of its own past its edges as well', () => {
    expect(afterReaches(others).filter(({ entry }) => !AFTER_AWAITED.has(entry)).map(({ at }) => at)).toEqual([]);
  });

  it('still owe each control on the waiting list its change, until that change comes and it leaves the list', () => {
    const owed = new Set(afterReaches(others).map(({ entry }) => entry));
    expect([...AFTER_AWAITED].filter((entry) => !owed.has(entry))).toEqual([]);
  });

  it('are read the way they are written', () => {
    // The reading itself, on known sheets: a check that reads nothing would always pass.
    expect(ownBefores(sheet('.card .chip::before { content: "" } .chip .dot::before, .chip-row::before { content: "" }'))).toEqual([
      'known.css:1 .card .chip::before (.chip)',
    ]);
    const clipped = clippers(sheet('.chip { overflow: hidden }\n.chip::after { overflow: hidden }\n.chip-row { overflow-x: auto }\n.btn.is-shaped { clip-path: circle() }'));
    expect(clipped.map(({ at }) => at)).toEqual(['known.css:1 .chip: overflow: hidden', 'known.css:4 .btn.is-shaped: clip-path: circle()']);
    const reaching = afterReaches(sheet('.chip::after { inset: -6px }\n.chip::after { inset: 0 }\n.chip .dot::after { inset: -2px }\n.btn::after { top: calc(2px - 4px) }'));
    expect(reaching.map(({ at }) => at)).toEqual(['known.css:1 .chip::after: inset: -6px', 'known.css:4 .btn::after: top: calc(2px - 4px)']);
  });
});

describe('the rows that scroll sideways', () => {
  const others = [...parsed].filter(([path]) => path !== 'styles/reach.css');
  const sheet = (css: string): Array<[string, Root]> => [['known.css', postcss.parse(css, { from: 'known.css' })]];

  it('keep room above and below their controls wherever they scroll, taking the room above back in their margin', () => {
    const short: string[] = [];
    for (const row of SCROLLERS.filter((r) => !ROOM_AWAITED.has(r))) {
      const room = ROOM_HELD.get(row) ?? ROOM;
      const boxes = scrollerBoxes(row, others);
      if (boxes.length === 0) short.push(`${row}: scrolls nowhere`);
      for (const b of boxes) {
        if (!((b.top ?? -1) >= room && (b.bottom ?? -1) >= room)) short.push(`${b.at} ${row}: padding ${b.top} above and ${b.bottom} below, under ${room}`);
        // Below a row, the room may be existing padding, so only the top is held to its margin.
        if (!((b.marginTop ?? 0) <= -room)) short.push(`${b.at} ${row}: margin ${b.marginTop} above, so the room moves the row down`);
      }
    }
    expect(short).toEqual([]);
  });

  it('still owe each row on the waiting list its room, until that change comes and it leaves the list', () => {
    const roomy = [...ROOM_AWAITED].filter((row) => {
      const boxes = scrollerBoxes(row, others);
      return boxes.length > 0 && boxes.every((b) => (b.top ?? -1) >= ROOM && (b.bottom ?? -1) >= ROOM);
    });
    expect(roomy).toEqual([]);
  });

  it('are read the way they are written', () => {
    expect(px('calc(var(--space-3) + 8px)')).toBe(20);
    expect(px('calc(4px - 8px)')).toBe(-4);
    expect(px('calc(var(--space-4) * -1)')).toBe(-16);
    expect(px('0')).toBe(0);
    expect(px('auto')).toBeUndefined();
    expect(px('50%')).toBeUndefined();
    const boxes = scrollerBoxes(
      '.row',
      sheet(
        [
          '.row { overflow-x: auto; padding: 2px 0 }',
          '.wide .row { padding-block: 10px calc(6px + 8px); margin-block: -8px 4px }',
          '@media (min-width: 9px) { .row { padding-inline: 0 } }',
          '@media (min-width: 99px) { .row { overflow: visible; padding: 0 } }',
          '.row::-webkit-scrollbar { display: none }',
        ].join('\n'),
      ),
    );
    expect(boxes).toEqual([
      { at: 'known.css:1', top: 2, bottom: 2, marginTop: 0 },
      { at: 'known.css:2', top: 10, bottom: 14, marginTop: -8 },
      { at: 'known.css:3', top: 2, bottom: 2, marginTop: 0 },
    ]);
  });
});
