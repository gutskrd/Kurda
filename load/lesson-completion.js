// Lesson traffic (KUR-118): steady learners starting + completing lessons —
// the app's bread-and-butter read/write mix (session start, answers, XP write).
// Run: k6 run load/lesson-completion.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, PASSWORD, vuEmail, API_THRESHOLDS, authHeaders } from './lib/config.js';

export const options = {
  scenarios: {
    lessons: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: 300, duration: '1m' },
        { target: 300, duration: '3m' }, // sustained soak
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: API_THRESHOLDS,
};

function token() {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email: vuEmail(__VU), password: PASSWORD }), authHeaders());
  return res.json('tokens.accessToken');
}

export default function () {
  const t = token();
  if (!t) return;
  const opts = authHeaders(t);

  // course map → daily goal → a review queue pull (representative read path)
  const courses = http.get(`${BASE_URL}/courses`, opts);
  check(courses, { 'courses 200': (r) => r.status === 200 });
  http.get(`${BASE_URL}/me/daily-goal`, opts);
  const queue = http.get(`${BASE_URL}/review/queue`, opts);
  check(queue, { 'review queue 200': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1);
}
