import { describe, expect, it } from 'vitest';
import { KINGDOM_BUILDINGS } from './buildings.js';
import { KINGDOM_PLOTS, KINGDOM_SCENE } from '../../art/kingdom.js';
import { HEART, OPENING_MIN_BUILDING, between, cameraOn, canvasAt, clampCamera, openingCamera, panBy, transformOf, visibleRect, zoomAt, zoomLimits, type Stage } from './camera.js';

const phone: Stage = { w: 390, h: 780, top: 76, bottom: 200 };
const desk: Stage = { w: 845, h: 672, top: 76, bottom: 220 };

describe('the village’s camera', () => {
  it('opens on the village’s heart, near enough that every building is at least 130 pixels across on a phone', () => {
    const c = openingCamera(phone);
    for (const b of KINGDOM_BUILDINGS) expect(KINGDOM_PLOTS[b].box.w * c.s, b).toBeGreaterThanOrEqual(OPENING_MIN_BUILDING);
    expect(Math.abs(c.x - HEART.x)).toBeLessThan(1);
    // the heart sits in the middle of the band between the bar and the tray
    const { tx, ty, s } = transformOf(c, phone);
    expect(tx + HEART.x * s).toBeCloseTo(phone.w / 2, 0);
    expect(ty + HEART.y * s).toBeCloseTo(phone.top + (phone.h - phone.top - phone.bottom) / 2, 0);
  });

  it('zooms out until the world just covers the stage, and no further, so its edge is never seen', () => {
    for (const v of [phone, desk]) {
      const { min, max, open } = zoomLimits(v);
      expect(min).toBeCloseTo(Math.max(v.w / KINGDOM_SCENE.width, v.h / KINGDOM_SCENE.height), 6);
      expect(open).toBeGreaterThanOrEqual(min);
      expect(max).toBeGreaterThan(open * 2);
      const far = clampCamera({ x: -5000, y: 99999, s: 0.01 }, v);
      expect(far.s).toBe(min);
      const { tx, ty, s } = transformOf(far, v);
      expect(tx).toBeLessThanOrEqual(0.001);
      expect(ty).toBeLessThanOrEqual(0.001);
      expect(tx + KINGDOM_SCENE.width * s).toBeGreaterThanOrEqual(v.w - 0.001);
      expect(ty + KINGDOM_SCENE.height * s).toBeGreaterThanOrEqual(v.h - 0.001);
      expect(clampCamera({ x: 1000, y: 600, s: 99 }, v).s).toBe(max);
    }
  });

  it('keeps the point under a pinch or a wheel where it was as it zooms', () => {
    const c = openingCamera(desk);
    const before = canvasAt(c, desk, 300, 260);
    const after = zoomAt(c, desk, 300, 260, 1.4);
    expect(after.s).toBeCloseTo(c.s * 1.4, 6);
    const again = canvasAt(after, desk, 300, 260);
    expect(again.x).toBeCloseTo(before.x, 3);
    expect(again.y).toBeCloseTo(before.y, 3);
  });

  it('pans with a drag, the world following the finger, and stops at the world’s edge', () => {
    const c = openingCamera(phone);
    const moved = panBy(c, phone, 40, -20);
    expect(moved.x).toBeCloseTo(c.x - 40 / c.s, 6);
    expect(moved.y).toBeCloseTo(c.y + 20 / c.s, 6);
    const edge = panBy(c, phone, 1e6, 1e6);
    expect(transformOf(edge, phone).tx).toBeCloseTo(0, 3);
  });

  it('says what of the world is near the view, a little wider than the view itself', () => {
    const c = openingCamera(phone);
    const r = visibleRect(c, phone, 0);
    expect(r.w).toBeCloseTo(phone.w / c.s, 3);
    expect(r.h).toBeCloseTo(phone.h / c.s, 3);
    const wide = visibleRect(c, phone, 0.25);
    expect(wide.w).toBeCloseTo(r.w * 1.5, 3);
  });

  it('goes to a building at least as near as the opening view, and glides there evenly', () => {
    const box = KINGDOM_PLOTS.orchard.box;
    const at = cameraOn(box, phone, 0.1);
    expect(at.s).toBe(zoomLimits(phone).open);
    expect(at.x).toBeCloseTo(box.x + box.w / 2, 3);
    const a = { x: 0, y: 0, s: 1 };
    const b = { x: 100, y: 50, s: 4 };
    expect(between(a, b, 0)).toEqual(a);
    expect(between(a, b, 1)).toEqual(b);
    expect(between(a, b, 0.5).s).toBeCloseTo(2, 6);
  });
});
