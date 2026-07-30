import { describe, expect, it } from 'vitest';
import { StubImageScanner, scanImageForSurface } from './image-scanner.js';

describe('image scanner', () => {
  it('reports clean by default → allow', async () => {
    const s = new StubImageScanner();
    const { verdict } = await scanImageForSurface(s, 'k1', 'feed');
    expect(verdict.action).toBe('allow');
    expect(verdict.withheld).toBe(false);
  });

  it('gates high-NSFW on the feed and blocks it on stricter profile', async () => {
    const s = new StubImageScanner();
    s.setVerdict('k2', { nsfwScore: 0.85, violenceScore: 0, csamMatch: false });
    expect((await scanImageForSurface(s, 'k2', 'feed')).verdict.action).toBe('gate'); // feed gate 0.8
    expect((await scanImageForSurface(s, 'k2', 'profile')).verdict.action).toBe('auto_block'); // profile block 0.85
  });

  it('hard-blocks a CSAM hash match with evidence preserved', async () => {
    const s = new StubImageScanner();
    s.setVerdict('k3', { nsfwScore: 0, violenceScore: 0, csamMatch: true });
    const { verdict } = await scanImageForSurface(s, 'k3', 'feed');
    expect(verdict.action).toBe('hard_block');
    expect(verdict.preserveEvidence).toBe(true);
    expect(verdict.reasons).toContain('csam');
  });

  it('fails closed (gate) when the scanner throws', async () => {
    const throwing = { scan: async () => { throw new Error('scanner down'); } };
    const { verdict, report } = await scanImageForSurface(throwing, 'k4', 'feed');
    expect(verdict.action).toBe('gate');
    expect(verdict.withheld).toBe(true);
    expect(report).toBeNull();
  });
});
