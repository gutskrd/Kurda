import { describe, expect, it } from 'vitest';
import {
  AVATAR_CATALOG,
  DEFAULT_AVATAR,
  baseItemIds,
  itemsForSlot,
  validateAvatarConfig,
  type AvatarConfig,
} from './catalog.js';
import { kurdishAvatarSvg } from './render.js';
import { validateAnimatedFragment } from './animation.js';

describe('avatar catalog', () => {
  it('has unique ids and Kurdish-first names everywhere', () => {
    const ids = AVATAR_CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of AVATAR_CATALOG) {
      expect(item.nameKu.length, item.id).toBeGreaterThan(1);
      expect(item.nameEn.length, item.id).toBeGreaterThan(1);
    }
  });

  it('keeps identity slots (skin, hair) entirely free', () => {
    for (const slot of ['skinTone', 'hairStyle', 'hairColor'] as const) {
      for (const item of itemsForSlot(slot)) {
        expect(item.base, item.id).toBe(true);
      }
    }
  });

  it('carries the traditional Kurdish garments', () => {
    const ids = AVATAR_CATALOG.map((i) => i.id);
    for (const cultural of [
      'outfit-sal-sapik',
      'outfit-kiras-fistan',
      'outfit-pesmerge',
      'head-jamadani',
      'head-kofi',
      'bg-newroz',
      'bg-roj',
    ]) {
      expect(ids).toContain(cultural);
    }
    // şal û şapik and kiras û fistan are free — traditional dress is
    // the default identity, not a paywalled skin
    expect(baseItemIds().has('outfit-sal-sapik')).toBe(true);
    expect(baseItemIds().has('outfit-kiras-fistan')).toBe(true);
  });

  it('default avatar is fully base-owned and valid', () => {
    expect(validateAvatarConfig(DEFAULT_AVATAR, new Set())).toEqual([]);
  });
});

describe('validateAvatarConfig', () => {
  it('rejects unknown items, wrong slots and unowned premium items', () => {
    const config: AvatarConfig = {
      ...DEFAULT_AVATAR,
      skinTone: 'skin-nope',
      outfit: 'head-kum', // wrong slot
      background: 'bg-newroz', // premium, not owned
    };
    const errors = validateAvatarConfig(config, new Set());
    expect(errors).toContainEqual({ kind: 'unknown_item', slot: 'skinTone', id: 'skin-nope' });
    expect(errors).toContainEqual({ kind: 'wrong_slot', slot: 'outfit', id: 'head-kum' });
    expect(errors).toContainEqual({ kind: 'not_owned', slot: 'background', id: 'bg-newroz' });
  });

  it('accepts premium items once owned', () => {
    const config: AvatarConfig = { ...DEFAULT_AVATAR, headwear: 'head-kofi' };
    expect(validateAvatarConfig(config, new Set())).toHaveLength(1);
    expect(validateAvatarConfig(config, new Set(['head-kofi']))).toEqual([]);
  });
});

describe('kurdishAvatarSvg', () => {
  it('renders valid, deterministic SVG', () => {
    const a = kurdishAvatarSvg(DEFAULT_AVATAR);
    const b = kurdishAvatarSvg(DEFAULT_AVATAR);
    expect(a).toBe(b);
    expect(a.startsWith('<svg')).toBe(true);
    expect(a.endsWith('</svg>')).toBe(true);
    expect(a).toContain('viewBox="0 0 200 200"');
  });

  it('every catalog combination renders without throwing', () => {
    for (const outfit of itemsForSlot('outfit')) {
      for (const headwear of itemsForSlot('headwear')) {
        const svg = kurdishAvatarSvg({
          ...DEFAULT_AVATAR,
          outfit: outfit.id,
          headwear: headwear.id,
        });
        expect(svg).toContain('</svg>');
      }
    }
    for (const bg of itemsForSlot('background')) {
      for (const hair of itemsForSlot('hairStyle')) {
        expect(
          kurdishAvatarSvg({ ...DEFAULT_AVATAR, background: bg.id, hairStyle: hair.id }),
        ).toContain('</svg>');
      }
    }
  });

  it('the Kurdish sun background carries exactly 21 rays', () => {
    const svg = kurdishAvatarSvg({ ...DEFAULT_AVATAR, background: 'bg-roj' });
    expect(svg.match(/rotate\(/g)).toHaveLength(21);
  });

  it('distinct outfits produce distinct art', () => {
    const salSapik = kurdishAvatarSvg({ ...DEFAULT_AVATAR, outfit: 'outfit-sal-sapik' });
    const kirasFistan = kurdishAvatarSvg({ ...DEFAULT_AVATAR, outfit: 'outfit-kiras-fistan' });
    const newroz = kurdishAvatarSvg({ ...DEFAULT_AVATAR, outfit: 'outfit-newroz' });
    expect(salSapik).not.toBe(kirasFistan);
    expect(kirasFistan).not.toBe(newroz);
    // Newroz outfit uses the flag colors
    expect(newroz).toContain('#D32011');
    expect(newroz).toContain('#FFD700');
    expect(newroz).toContain('#1E9E4A');
  });

  it('unknown item ids fall back per-layer, never a blank avatar (edge)', () => {
    const svg = kurdishAvatarSvg({
      skinTone: 'gone-1',
      hairStyle: 'gone-2',
      hairColor: 'gone-3',
      outfit: 'gone-4',
      headwear: 'gone-5',
      background: 'gone-6',
    });
    expect(svg).toContain('</svg>');
    expect(svg).toContain('circle'); // head still drawn
    expect(svg.length).toBeGreaterThan(500);
  });

  it('respects the size parameter without changing geometry', () => {
    const small = kurdishAvatarSvg(DEFAULT_AVATAR, 64);
    expect(small).toContain('width="64"');
    expect(small).toContain('viewBox="0 0 200 200"');
  });
});

describe('animated cosmetics (KUR-080)', () => {
  const newroz = { ...DEFAULT_AVATAR, background: 'bg-newroz' };

  it('static render is the default and carries no animation nodes', () => {
    const svg = kurdishAvatarSvg(newroz);
    expect(svg).not.toContain('<animate');
  });

  it('the animated Newroz fire passes every format rule', () => {
    const animated = kurdishAvatarSvg(newroz, 200, { animate: true });
    expect(animated).toContain('<animateTransform');
    expect(validateAnimatedFragment(animated)).toEqual([]);
  });

  it('animation is additive: static shapes identical with the flag on', () => {
    const staticSvg = kurdishAvatarSvg(newroz);
    const animated = kurdishAvatarSvg(newroz, 200, { animate: true });
    const stripped = animated
      .replace(/<animate(Transform|Motion)?\b[^>]*\/>/g, '')
      .replace(/<g transform-origin="100 196">/, '<g transform-origin="100 196">');
    for (const shape of staticSvg.match(/<polygon[^>]+\/>/g) ?? []) {
      expect(stripped).toContain(shape.slice(0, 60));
    }
  });

  it('validator rejects rule violations', () => {
    expect(
      validateAnimatedFragment('<animate dur="9s" repeatCount="indefinite"/>'),
    ).toContainEqual({ rule: 'bad_duration', dur: '9s' });
    expect(validateAnimatedFragment('<circle r="4"/><animate dur="2s"/>')).toContainEqual({
      rule: 'not_looping',
      node: 1,
    });
    const many = '<rect/>' + '<animate dur="2s" repeatCount="indefinite"/>'.repeat(4);
    expect(validateAnimatedFragment(many)).toContainEqual({ rule: 'too_many_nodes', count: 4 });
    expect(validateAnimatedFragment('<animate dur="2s" repeatCount="indefinite"/>')).toContainEqual(
      { rule: 'no_static_base' },
    );
  });

  it('only catalog items marked animatable may animate (registry sanity)', () => {
    const animatable = AVATAR_CATALOG.filter((i) => i.animatable);
    expect(animatable.map((i) => i.id)).toEqual(['bg-newroz']);
  });
});
