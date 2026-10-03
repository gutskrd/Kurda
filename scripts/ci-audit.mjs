#!/usr/bin/env node
/**
 * CI security gate (KUR-111): fail on any high/critical npm advisory EXCEPT a
 * small, documented allowlist of advisories that are (a) in build-time-only
 * tooling with no runtime/user exposure and (b) not yet cleanly fixable.
 *
 * This keeps `npm audit --audit-level=high` strong — any NEW high/critical, or
 * any advisory not on the list, still fails the build — while not blocking every
 * PR on a known, non-exploitable, upstream-pending issue. Prefer a real fix
 * (bump / override) over adding to this list; each entry must justify itself and
 * name the condition under which it is removed.
 */
import { execSync } from 'node:child_process';

/** advisoryId -> why it's accepted + when to drop it. */
const ALLOWLIST = {
  // image-size DoS via infinite loops in the ICNS / JXL / HEIF parsers. Pulled
  // ONLY by metro (the Expo/React Native bundler) — a build-time dependency that
  // parses the project's own trusted assets, never untrusted user input, and is
  // not shipped in the app runtime. The patched major (image-size@2) changes the
  // module export and breaks metro's API, so it cannot be overridden without
  // downgrading Expo. REMOVE once a metro/Expo release ships a patched image-size.
  'GHSA-w3rx-r6r6-pgpr': 'image-size ICNS DoS — build-only (metro); no runtime exposure; awaiting patched Expo/metro',
  'GHSA-5p2g-fcmc-qvqq': 'image-size JXL/HEIF DoS — build-only (metro); no runtime exposure; awaiting patched Expo/metro',
  // braces exhausts the stack on a deeply nested pattern. Reached only under
  // `@expo/cli` → `@expo/metro-file-map` → `micromatch`: the Expo bundler,
  // which runs on a developer's machine over this repository's own files.
  // Nothing in mobile/, api/, web/ or admin/ imports micromatch or braces, so
  // it is in nothing shipped to a phone or served to a browser, and the
  // patterns it sees are ours rather than a stranger's.
  //
  // Unfixable rather than unfixed, like node-forge below: the advisory's
  // patched range is `<=3.0.3`, which is every version ever published, and
  // npm's suggested remedy is downgrading expo 57 to 44.0.6.
  //
  // REMOVE once braces publishes a patched release and Expo picks it up.
  'GHSA-vfj7-8cjw-p6xm':
    'braces stack exhaustion — build-only (@expo/cli metro); not bundled; no patched version exists',
  // node-forge accepts extra nested DigestAlgorithm elements when verifying an
  // RSA PKCS#1 v1.5 signature. Serious where it is reached — and it is not
  // reached here. It arrives only under `@expo/cli` and
  // `@expo/code-signing-certificates`: the Expo command line, which runs on a
  // developer's machine, and the certificate verification for Expo's own signed
  // updates, which this project does not use (no `codeSigning` in app.json).
  // Nothing in mobile/, api/ or web/ imports it, so Metro never bundles it and
  // it is not in anything shipped to a phone or served to a browser.
  //
  // It is also unfixable rather than unfixed: the advisory's patched range is
  // `<=1.4.0`, which is every version ever published, and npm's suggested
  // remedy is downgrading expo 57 to 44.0.6 — three years back, across two
  // majors, to escape a build-time tool.
  //
  // REMOVE once node-forge publishes a patched release and Expo picks it up.
  'GHSA-86w9-cpqp-85rv':
    'node-forge PKCS#1 v1.5 signature confusion — build-only (@expo/cli); not bundled; no patched version exists',
  // fastify's seven advisories, one of them an authentication bypass, were here
  // for about a minute. `^5.11.0` already allowed the fix, so `npm update
  // fastify` took the tree to 5.12.5 and they are gone. Check the declared
  // range before reaching for this list.
  //
  // browserslist's two advisories were here, accepted as build-only and marked
  // REMOVE once the tree resolved past 4.28.6 on its own. `npm update
  // browserslist` did that — 4.29.3 — so they are gone, for the same reason the
  // fast-uri ones below are.
  //
  // fast-uri's four host-confusion / SSRF advisories were here, with the note
  // that 3.1.7 was the fix and a lockfile regen was out of scope. `npm update
  // fast-uri` was the regen, the tree now resolves 3.1.7, and the entries are
  // gone — which is the point of writing down a removal condition. Leaving them
  // would have meant a slide back to a vulnerable fast-uri passed the gate in
  // silence, and it was the only vulnerable package that actually shipped.
};

function auditJson() {
  try {
    // npm audit exits non-zero when advisories exist; capture stdout regardless.
    return JSON.parse(execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

const report = auditJson();
const vulns = report.vulnerabilities ?? {};

/** Collect distinct advisory ids at high/critical severity (leaf advisory objects). */
const seen = new Map(); // id -> { title, severity, packages:Set }
for (const [pkg, v] of Object.entries(vulns)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue;
  for (const via of v.via ?? []) {
    if (typeof via === 'object' && via.url) {
      const id = via.url.split('/').pop();
      if (!seen.has(id)) seen.set(id, { title: via.title, severity: via.severity ?? v.severity, packages: new Set() });
      seen.get(id).packages.add(pkg);
    }
  }
}

const unexpected = [...seen.entries()].filter(([id]) => !(id in ALLOWLIST));

console.log('npm audit high/critical advisories:');
for (const [id, info] of seen) {
  const status = id in ALLOWLIST ? 'ALLOWLISTED' : 'BLOCKING';
  console.log(`  [${status}] ${id} (${info.severity}) — ${info.title}`);
}

if (unexpected.length > 0) {
  console.error(`\n✖ ${unexpected.length} high/critical advisory(ies) not on the allowlist — failing.`);
  console.error('  Fix them (npm audit fix / an override) or, if truly unfixable + non-exploitable, add a justified entry to scripts/ci-audit.mjs.');
  process.exit(1);
}

console.log(`\n✓ No blocking advisories (${seen.size} allowlisted, documented in scripts/ci-audit.mjs).`);
