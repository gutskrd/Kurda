// Login storm (KUR-118): a spike of concurrent logins — the classic
// morning/streak-reminder thundering herd. Validates auth + token issuance
// under burst load.  Run: k6 run load/login-storm.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, PASSWORD, vuEmail, API_THRESHOLDS, authHeaders } from './lib/config.js';

export const options = {
  scenarios: {
    login_storm: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { target: 200, duration: '30s' }, // ramp
        { target: 1500, duration: '1m' }, // storm
        { target: 0, duration: '30s' }, // drain
      ],
    },
  },
  thresholds: API_THRESHOLDS,
};

export default function () {
  const email = vuEmail(__VU);
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password: PASSWORD }), authHeaders());
  check(res, {
    'login 200': (r) => r.status === 200,
    'issued access token': (r) => !!r.json('tokens.accessToken'),
  });
  sleep(1);
}
