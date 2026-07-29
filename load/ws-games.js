// 10k concurrent WS games (KUR-118): the headline scale target — sustained
// WebSocket connections receiving question/reveal fan-out. Asserts event
// fan-out p95 < 100ms via a custom trend. Run: k6 run load/ws-games.js
//
// Scale note: 10k concurrent sockets from one k6 node is optimistic — run
// distributed (k6 Cloud or several load generators) to reach the full target.
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import http from 'k6/http';
import { BASE_URL, WS_URL, PASSWORD, vuEmail, WS_THRESHOLDS, authHeaders } from './lib/config.js';

const wsEventLatency = new Trend('ws_event_latency', true);

export const options = {
  scenarios: {
    ws_games: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: 2000, duration: '1m' }, // ramp to 2k/node (×5 nodes = 10k)
        { target: 2000, duration: '3m' }, // hold
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: WS_THRESHOLDS,
};

export default function () {
  const login = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email: vuEmail(__VU), password: PASSWORD }), authHeaders());
  const token = login.json('tokens.accessToken');
  if (!token) return;

  const url = `${WS_URL}/realtime?token=${token}`;
  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => socket.send(JSON.stringify({ type: 'ready' })));
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw);
      // server stamps sentAt on broadcasts; measure fan-out latency to this client
      if (msg.sentAt) wsEventLatency.add(Date.now() - msg.sentAt);
    });
    socket.setTimeout(() => socket.close(), 60_000);
  });
  check(res, { 'ws connected (101)': (r) => r && r.status === 101 });
}
