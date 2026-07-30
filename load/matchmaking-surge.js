// Matchmaking surge (KUR-118): a wave of players hitting "Play" at once —
// stresses the atomic queue + pairing sweep. Run: k6 run load/matchmaking-surge.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, PASSWORD, vuEmail, API_THRESHOLDS, authHeaders } from './lib/config.js';

export const options = {
  scenarios: {
    surge: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 400,
      maxVUs: 1500,
      stages: [
        { target: 100, duration: '20s' },
        { target: 800, duration: '40s' }, // surge
        { target: 0, duration: '20s' },
      ],
    },
  },
  thresholds: API_THRESHOLDS,
};

export default function () {
  const login = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email: vuEmail(__VU), password: PASSWORD }), authHeaders());
  const t = login.json('tokens.accessToken');
  if (!t) return;
  const opts = authHeaders(t);

  const enqueue = http.post(`${BASE_URL}/matchmaking/queue`, JSON.stringify({ mode: '1v1' }), opts);
  check(enqueue, { 'enqueue accepted': (r) => r.status === 200 || r.status === 202 });
  // poll for a match a couple of times, then leave
  for (let i = 0; i < 3; i++) {
    sleep(1);
    http.get(`${BASE_URL}/matchmaking/status`, opts);
  }
  http.del(`${BASE_URL}/matchmaking/queue`, null, opts);
}
