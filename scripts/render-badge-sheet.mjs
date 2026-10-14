/**
 * Contact sheets for the badge, rank, league and season-frame art in
 * `shared/src/art/`, for looking at — not for shipping.
 *
 *   node scripts/render-badge-sheet.mjs              writes PNGs to /tmp/art
 *   node scripts/render-badge-sheet.mjs --out <dir>  writes them to <dir>
 *
 * Each sheet is drawn twice, on the app's dark background and on its light
 * one, because the art has to hold up on both. The drawings are the exact
 * strings the apps render; sharp only rasterises them. The labels on the
 * sheets are set in whatever sans-serif the machine has, which is fine for a
 * proof and is why nothing here is committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { register } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
register();
const art = await import(pathToFileURL(path.join(ROOT, 'shared/src/art/index.ts')).href);

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : '/tmp/art';
fs.mkdirSync(OUT, { recursive: true });

const THEMES = {
  dark: { bg: '#0b0d10', ink: '#ffffff', sub: 'rgba(255,255,255,0.55)' },
  light: { bg: '#f3f3f3', ink: '#141414', sub: 'rgba(20,20,20,0.55)' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Puts a drawing at x,y on the sheet: its outer <svg> becomes a nested one. */
function at(svg, x, y) {
  return svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, `<svg x="${x}" y="${y}" `);
}

function label(text, x, y, theme, size = 13, colour) {
  return `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" fill="${colour ?? theme.ink}" text-anchor="middle">${esc(text)}</text>`;
}

async function sheet(name, width, height, draw) {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const body = draw(theme);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${theme.bg}"/>${body}</svg>`;
    const file = path.join(OUT, `${name}-${themeName}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    console.log(file);
  }
}

// ── badges: every key, every tier, plus locked and secret
{
  const keys = art.BADGE_KEYS;
  const cell = 104;
  const perRow = 2;
  const group = cell * 6 + 24;
  const rows = Math.ceil(keys.length / perRow);
  await sheet('badges', perRow * group + 20, rows * (cell + 34) + 20, (theme) => {
    const out = [];
    keys.forEach((key, i) => {
      const gx = 20 + (i % perRow) * group;
      const gy = 20 + Math.floor(i / perRow) * (cell + 34);
      const def = art.BADGES[key];
      const tiers = def.tiers > 1 ? [1, 2, 3, 4] : [1];
      tiers.forEach((tier, j) => {
        out.push(at(art.badgeSvg({ key, tier, size: 96 }), gx + j * cell, gy));
      });
      const lockedX = gx + 4 * cell;
      out.push(at(art.badgeSvg({ key, tier: 1, state: 'locked', size: 96 }), lockedX, gy));
      if (def.family === 'secret') out.push(at(art.badgeSvg({ key, state: 'secret', size: 96 }), lockedX + cell, gy));
      out.push(label(`${key} (${def.family})`, gx + cell * 2.5, gy + cell + 16, theme, 13, theme.sub));
    });
    return out.join('');
  });
}

// ── a gallery: every badge at 128, at its own top look
{
  const keys = art.BADGE_KEYS;
  const perRow = 8;
  const cell = 150;
  await sheet('badges-gallery', perRow * cell + 20, Math.ceil(keys.length / perRow) * (cell + 10) + 20, (theme) =>
    keys
      .map((key, i) => {
        const x = 20 + (i % perRow) * cell;
        const y = 20 + Math.floor(i / perRow) * (cell + 10);
        const tier = art.BADGES[key].tiers > 1 ? 3 : 1;
        return at(art.badgeSvg({ key, tier, size: 128 }), x, y) + label(key, x + 64, y + 146, theme, 11, theme.sub);
      })
      .join(''),
  );
}

// ── the glint stepping across a Zêr and a Firûze badge
{
  const steps = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1];
  await sheet('badge-glint', steps.length * 120 + 40, 2 * 120 + 40, () => {
    const out = [];
    [['agir', 3], ['tire-rast', 1]].forEach(([key, tier], r) => {
      steps.forEach((phase, i) => {
        const x = 20 + i * 120;
        const y = 20 + r * 120;
        out.push(at(art.badgeSvg({ key, tier, size: 104 }), x, y));
        out.push(at(art.badgeShineSvg({ key, size: 104, phase }), x, y));
      });
    });
    return out.join('');
  });
}

// ── badges at the sizes the apps use them
{
  const sample = ['agir', 'ders', 'peyvzan', 'rank-ciya', 'heval', 'agire-newroze', 'kewe-ciye', 'bilez', 'zivistan', 'hemereng'];
  const sizes = [32, 40, 48, 64, 128];
  const colW = 150;
  await sheet('badge-sizes', sizes.length * colW * 1 + 20, sample.length * 4 * 140 + 40, (theme) => {
    const out = [];
    let y = 20;
    for (const key of sample) {
      for (const tier of [1, 2, 3, 4]) {
        let x = 20;
        for (const size of sizes) {
          out.push(at(art.badgeSvg({ key, tier, size }), x + (128 - size) / 2, y + (128 - size) / 2));
          x += colW;
        }
        y += 140;
      }
    }
    return out.join('');
  });
}

// ── rank emblems: every tier × division
{
  const divisions = [undefined, 3, 2, 1];
  const cell = 150;
  await sheet('ranks', divisions.length * cell + 40, art.RANK_TIERS.length * (cell + 20) + 40, (theme) => {
    const out = [];
    art.RANK_TIERS.forEach((tier, r) => {
      divisions.forEach((division, c) => {
        if (tier === 'sterk' && division !== undefined) return;
        const x = 20 + c * cell;
        const y = 20 + r * (cell + 20);
        out.push(at(art.rankEmblemSvg({ tier, division, size: 136 }), x, y));
        out.push(label(`${tier} ${division ?? '—'}`, x + 68, y + 150, theme, 12, theme.sub));
      });
    });
    return out.join('');
  });
  // season emblems: a season's peak tier, kept for good
  await sheet('ranks-seasons', art.RANK_TIERS.length * 150 + 40, 200, (theme) => {
    const out = [];
    art.RANK_TIERS.forEach((tier, i) => {
      const season = art.SEASONS[i % 4];
      out.push(at(art.rankEmblemSvg({ tier, season: { name: season, year: 2027 + Math.floor(i / 4) }, size: 136 }), 20 + i * 150, 20));
      out.push(label(`${tier} · ${season}`, 20 + i * 150 + 68, 176, theme, 12, theme.sub));
    });
    return out.join('');
  });
  // before a first tier: placing 0–5
  await sheet('ranks-placing', 6 * 150 + 40, 260, () => {
    const out = [];
    for (let done = 0; done <= 5; done++) {
      out.push(at(art.placementEmblemSvg({ done, size: 136 }), 20 + done * 150, 20));
      out.push(at(art.placementEmblemSvg({ done, size: 40 }), 20 + done * 150 + 48, 180));
    }
    return out.join('');
  });
  // and small
  await sheet('ranks-small', art.RANK_TIERS.length * 120 + 40, 3 * 80 + 40, () => {
    const out = [];
    art.RANK_TIERS.forEach((tier, i) => {
      [32, 48, 64].forEach((size, j) => {
        out.push(at(art.rankEmblemSvg({ tier, division: tier === 'sterk' ? undefined : 2, size }), 20 + i * 120, 20 + j * 80));
      });
    });
    return out.join('');
  });
}

// ── league emblems
if (art.leagueEmblemSvg) {
  await sheet('leagues', art.LEAGUE_TIERS.length * 150 + 40, 340, (theme) => {
    const out = [];
    art.LEAGUE_TIERS.forEach((tier, i) => {
      out.push(at(art.leagueEmblemSvg({ tier, size: 136 }), 20 + i * 150, 20));
      out.push(label(tier, 20 + i * 150 + 68, 172, theme, 12, theme.sub));
      [32, 48, 64].forEach((size, j) => out.push(at(art.leagueEmblemSvg({ tier, size }), 20 + i * 150 + j * 44, 200 + (j === 2 ? 0 : 64 - size))));
    });
    return out.join('');
  });
}

// ── season frames, around a stand-in avatar
if (art.seasonFrameSvg) {
  const avatar = (x, y, s) => {
    const r = (s / 2) * art.SEASON_FRAME_INNER;
    return `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${r}" fill="#6b3fa0"/><circle cx="${x + s / 2}" cy="${y + s / 2 - r * 0.2}" r="${r * 0.38}" fill="#d9b8ff"/><path d="M${x + s / 2 - r * 0.62},${y + s / 2 + r * 0.72} a${r * 0.62},${r * 0.5} 0 0 1 ${r * 1.24},0Z" fill="#d9b8ff"/>`;
  };
  await sheet('frames', art.RANK_TIERS.length * 150 + 40, 360, (theme) => {
    const out = [];
    art.RANK_TIERS.forEach((tier, i) => {
      const x = 20 + i * 150;
      out.push(avatar(x, 20, 136));
      out.push(at(art.seasonFrameSvg({ tier, size: 136 }), x, 20));
      out.push(label(tier, x + 68, 176, theme, 12, theme.sub));
      out.push(avatar(x, 196, 136));
      out.push(at(art.seasonFrameSvg({ tier, size: 136, shine: true }), x, 196));
    });
    return out.join('');
  });
}
