# Who is calling, and which accounts share a network

Three questions the API asks about every caller, and where each is answered:

1. **Which address is the client's?** `api/src/net/client-ip.ts`, applied once
   per request by `api/src/plugins/client-ip.ts`, so `req.ip` is the answer
   everywhere.
2. **Which network is that?** `api/src/net/network-key.ts`.
3. **Do two accounts share a device or a network?** `api/src/net/evidence.ts`,
   from the sightings in `network_sightings` (`api/src/net/sightings.ts`).

## 1. The client's address

In production the chain is client → Cloudflare edge → Render's balancer → the
container. Each proxy appends the peer it saw to `X-Forwarded-For`, so the
container sees:

```
socket:            10.x.x.x                     (Render's balancer)
X-Forwarded-For:   [client's own text], <client>, <Cloudflare edge>
CF-Connecting-IP:  <client>                     (always overwritten by Cloudflare)
```

The walk starts at the socket and skips the hops `TRUST_PROXY` trusts (by
default loopback and the private ranges). The first hop it does not trust is
the **edge**. Then:

| edge is | client is | `rule` |
| --- | --- | --- |
| a Cloudflare address, `CF-Connecting-IP` is one valid address | `CF-Connecting-IP` | `cf-connecting-ip` |
| a Cloudflare address, no usable `CF-Connecting-IP` | the `X-Forwarded-For` entry just left of the edge | `xff-left-of-edge` |
| a Cloudflare address, neither usable | the edge | `edge` |
| anything else | the edge, as before | `edge` |

The trusted hops are Fastify's own walk over `TRUST_PROXY`, so that setting
means what it always meant. Cloudflare's ranges are hard-coded in
`api/src/net/cloudflare.ts` (refresh from cloudflare.com/ips); they are never
added to `TRUST_PROXY`. `CLOUDFLARE_CLIENT_IP=off` turns the Cloudflare step off.

**Why a client cannot choose its address:**

- Text the client writes in `X-Forwarded-For` sits left of Cloudflare's entry.
  Only the entry immediately left of a verified Cloudflare edge is read, and
  nothing further left ever is.
- `CF-Connecting-IP` is believed only when the edge hop is a Cloudflare address.
  Sent straight at the balancer or the container, it arrives from an edge that
  is not Cloudflare's and is ignored.
- A caller that is itself on Cloudflare's network — a Worker's cross-zone
  subrequest arrives with `CF-Connecting-IP: 2a06:98c0:3600::103` — is that one
  address: one shared caller, not another proxy to walk past.
- Anything that is not exactly one address (a list, a port-only string, a zone
  on IPv4, a 10 KB header) is refused. A port, brackets, an IPv6 zone and the
  IPv4-mapped form are read for what they mean. At most the right-most 32
  `X-Forwarded-For` entries are looked at.

**What remains trusted:** that a connection arriving from a Cloudflare address
carries headers Cloudflare set. Cloudflare documents that for traffic through a
Cloudflare zone; a Worker that sends a request to an origin *outside* any
Cloudflare zone may set `CF-Connecting-IP` itself. Render serves the API
through its own Cloudflare zone, so that path needs a way to reach Render's
balancer that bypasses that zone. Closing it fully would take the edge
authenticating itself to the origin (authenticated origin pulls), which is the
zone owner's setting, not this code's.

The first request that comes through a proxy logs the chain once per process
(`api/src/plugins/proxy-chain.ts`): socket, the `X-Forwarded-For` chain, whether
`CF-Connecting-IP` was present, the edge, the rule and the resolved address.
DEPLOY.md says what to look for.

## 2. The network

| address | network key |
| --- | --- |
| IPv4 | the address |
| IPv4-mapped IPv6 (`::ffff:1.2.3.4`) | the IPv4 address |
| IPv6 | its /64 (`2001:db8:1:2::/64`) |

A home or office LAN is one /64 and devices rotate the lower 64 bits for
privacy, so an exact IPv6 match would both miss two accounts in one flat and
give one person a new identity with every address. The rate limiter's `ip:`
buckets, the login lockout's address scope, the sign-up cap and the risk
velocity all key on the network.

What is stored is never the address: it is an HMAC of the network key with the
server secret (`networkKeyHash`, purpose `network-v2`). The old plain SHA-256 of
an IPv4 address could be reversed by trying all of them. Rotating the server
secret makes old network hashes unrecognisable, which ends any links and locks
they carried — the same trade the moderation pseudonyms make.

## 3. Sightings and evidence

`network_sightings` holds one row per account, network and UTC day, with the
first and last time seen that day. It is written on sign-up and sign-in (with
the risk decision) and from signed-in requests, once per account, network and
day per process; recording never delays or fails a request. Rows are kept 90
days and pruned daily with `risk_decisions`.

Two accounts **share a network** only when both hold:

1. **Co-presence**: seen on the same network within 48 hours of each other.
2. **A quiet network**: at most 3 *other* established accounts (created more
   than 14 days before the co-presence) were seen on it within 7 days either
   side. A carrier's NAT, a campus, a café, a VPN or a relay exit is seen with
   many accounts and drops out. Fresh accounts do not count towards the crowd,
   so someone who makes new accounts at home cannot hide them from each other.
   Past 1,000 sightings in that fortnight a network is crowded without counting.

The evidence says `via: 'device'` when the accounts signed up or signed in with
the same device id (which outranks a network), else `via: 'network'`, with
`days` — distinct days of co-presence on a quiet network — and
`lastSeenTogether`. The same function decides the moderators' linked accounts
and the ranks' `shared_ip` pair flag, which is recomputed each time a pair plays
a rated game.

**Sign-up risk** treats a network as shared (the softer cap, 50 instead of 10
sign-ups a day) when the reputation provider says so, or when more than 5
established accounts were seen on it in the last 30 days.

## The clean-up (migration 1751000190000)

Until this change every stored address was a Cloudflare edge's. The migration
sets `risk_decisions.ip_hash` to NULL (and nothing writes it any more; decisions
carry `net_hash`), sets every `rating_pair_signals.shared_ip` to false, and
deletes `auth_lockouts` rows of scope `ip`, which were raw edge addresses.
