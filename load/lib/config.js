// Shared k6 config for the Kurda load suite (KUR-118).
// BASE_URL / WS_URL point at staging; a service token seeds VUs if needed.

export const BASE_URL = __ENV.BASE_URL || 'https://staging.kurda.app';
export const WS_URL = __ENV.WS_URL || BASE_URL.replace(/^http/, 'ws');

// Reserved domain so load-test users are excluded from analytics/leaderboards
// (mirrors api/src/loadtest/marker.ts — LOADTEST_EMAIL_DOMAIN).
export const LOADTEST_DOMAIN = 'loadtest.kurda.invalid';
export const vuEmail = (n) => `vu-${n}@${LOADTEST_DOMAIN}`;
export const PASSWORD = 'load-test-password-123';

// Pass/fail SLOs — the release-gate thresholds (AC).
export const API_THRESHOLDS = {
  http_req_failed: ['rate<0.01'], // <1% errors
  http_req_duration: ['p(95)<300'], // API p95 < 300ms
};

export const WS_THRESHOLDS = {
  ws_connecting: ['p(95)<1000'],
  // custom metric asserted per-scenario: event fan-out p95 < 100ms
  ws_event_latency: ['p(95)<100'],
};

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}
