// Shared k6 config for the Kurda load suite (KUR-118).
// BASE_URL points at staging; a service token seeds VUs if needed.

export const BASE_URL = __ENV.BASE_URL || 'https://staging.kurda.app';

// The reserved domain load-test accounts sign up under, so they are easy to find and delete after a run.
export const LOADTEST_DOMAIN = 'loadtest.kurda.invalid';
export const vuEmail = (n) => `vu-${n}@${LOADTEST_DOMAIN}`;
export const PASSWORD = 'load-test-password-123';

// Pass/fail SLOs — the release-gate thresholds (AC).
export const API_THRESHOLDS = {
  http_req_failed: ['rate<0.01'], // <1% errors
  http_req_duration: ['p(95)<300'], // API p95 < 300ms
};

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}
