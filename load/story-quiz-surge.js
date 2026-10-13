// Story quiz surge: a wave of learners starting a solo story quiz at once and
// answering it — stresses game creation (a story pick, the question plan),
// the answer path (a locked game row per answer) and the rewards transaction
// that closes the last question. The ranked-quiz matchmaking surge this
// replaces exercised a queue that no longer exists.
// Run: k6 run load/story-quiz-surge.js (staging needs published Kurmancî short stories)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, PASSWORD, vuEmail, API_THRESHOLDS, authHeaders } from './lib/config.js';

export const options = {
  scenarios: {
    surge: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 1000,
      stages: [
        { target: 50, duration: '20s' },
        { target: 300, duration: '40s' }, // surge
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

  // "Surprise me": a short Kurmancî story, three questions, no timer, straight to the questions
  const created = http.post(
    `${BASE_URL}/story-games`,
    JSON.stringify({
      mode: 'solo',
      dialect: 'kurmanci',
      length: 'short',
      questionCount: 3,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      skipReading: true,
    }),
    opts,
  );
  check(created, { 'quiz started': (r) => r.status === 201 });
  if (created.status !== 201) return;
  let view = created.json();

  // answer, read the reveal, go on — a solo game answers every request with its new view
  for (let i = 0; view && view.status === 'question' && i < 10; i++) {
    sleep(Math.random() * 3 + 2);
    const index = view.question.index;
    const answered = http.post(`${BASE_URL}/story-games/${view.id}/answers`, JSON.stringify({ index, choice: 0 }), opts);
    check(answered, { 'answer taken': (r) => r.status === 200 });
    sleep(1);
    const next = http.post(`${BASE_URL}/story-games/${view.id}/continue`, JSON.stringify({ index }), opts);
    view = next.status === 200 ? next.json() : null;
  }
}
