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
  // browserslist is a BUILD-TIME dep (autoprefixer / vite target resolution). Both
  // advisories require untrusted input we never feed it — a custom browserslist-stats.json
  // (we don't use one) or pathological distinct-query volume at build — and nothing
  // browserslist touches is shipped or reachable in the app runtime. A deep transitive
  // pin isn't cleanly overridable here without churning the monorepo lock; REMOVE once
  // the dependency tree resolves browserslist > 4.28.6 on its own.
  'GHSA-c83g-rgw3-j3cx': 'browserslist unbounded memory growth — build-only (autoprefixer/vite); no runtime exposure',
  'GHSA-73wf-gq98-2v4g': 'browserslist crash via untrusted custom stats — build-only; we never pass custom stats; no runtime exposure',
  // fast-uri host-confusion / SSRF advisories. fast-uri IS a runtime dependency,
  // but only of ajv (JSON-schema $ref resolution + `format:"uri"` validation) and
  // fast-json-stringify (response serialization) — neither ever makes a network
  // request or trust decision from a parsed URI, so the SSRF/host-confusion sink
  // does not exist in this stack. Crucially the API defines NO `format:"uri"` in
  // any request schema (verified), so no attacker-controlled input ever reaches
  // fast-uri at all; it only parses our own trusted, developer-authored $refs.
  // The patched fast-uri@3.1.7 is within every consumer's ^3 range, but an npm
  // `overrides` pin does not re-resolve the deduped transitive here without a full
  // lockfile regen (out of scope for a feature PR). REMOVE once the tree resolves
  // fast-uri > 3.1.5 on its own (Fastify/ajv dependency bump).
  'GHSA-5jgf-p345-68v8': 'fast-uri host confusion (scheme-relative) — runtime dep of ajv/fast-json-stringify; no request/trust sink; no format:uri on user input',
  'GHSA-f65p-4m7j-42xc': 'fast-uri SSRF via IPv6 normalization — runtime dep of ajv/fast-json-stringify; no request sink; no format:uri on user input',
  'GHSA-fph4-wmhf-6fwf': 'fast-uri SSRF via hostname percent-decoding — runtime dep of ajv/fast-json-stringify; no request sink; no format:uri on user input',
  'GHSA-jqff-g426-hqxp': 'fast-uri host confusion (percent-encoded scheme) — runtime dep of ajv/fast-json-stringify; no request/trust sink; no format:uri on user input',
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
