/**
 * Who was on which network, and when — and clearing what was recorded about
 * networks before the client's address was read correctly.
 *
 * Until now every address the API saw was a Cloudflare edge's, not a person's:
 * Render puts Cloudflare in front of the service and the proxy walk stopped at
 * the edge (net/client-ip.ts now reads past it). So everything keyed on "the
 * address" was keyed on one of a few dozen edges:
 *
 * - `risk_decisions.ip_hash` holds hashes of edges. It is set to NULL, and is
 *   no longer written: it was also a plain SHA-256, which for an IPv4 address
 *   is a lookup table away from the address. Decisions now carry `net_hash`,
 *   the keyed hash of the address's network (net/network-key.ts), which the
 *   signup cap and account linking read. The old column stays for now because
 *   the instance still serving while a deploy starts writes it; nothing reads
 *   it, and a later migration can drop it.
 * - `rating_pair_signals.shared_ip` was true for pairs who merely went through
 *   the same edge. It is set to false; it is recomputed every time a pair plays
 *   a rated game.
 * - `auth_lockouts` rows of scope 'ip' are raw edge addresses, which could
 *   lock out everyone behind an edge. They are deleted; address locks are now
 *   kept under the keyed network hash.
 *
 * `network_sightings` is one row per account, network and UTC day, with the
 * first and last time seen that day — written on sign-up and sign-in and, at
 * most once a day per network and process, on authenticated requests. It is
 * what "on the same network" is decided from (net/evidence.ts): seen within
 * two days of each other, on a network few other accounts use. Kept 90 days,
 * pruned with the risk decisions.
 *
 * `down` restores the schema. The values cleared here are not restored: they
 * described Cloudflare's edges, not anyone using the app.
 */

export const up = (pgm) => {
  pgm.createTable('network_sightings', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    // keyed hash of the network, never the address
    net_hash: { type: 'text', notNull: true },
    day: { type: 'date', notNull: true },
    first_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('network_sightings', 'network_sightings_pkey', { primaryKey: ['user_id', 'net_hash', 'day'] });
  // who else was on a network around a day. Deliberately no index on `day`
  // alone: the planner would pick it for "this network, these days" on a busy
  // table and read every network's rows; the daily prune can scan.
  pgm.createIndex('network_sightings', ['net_hash', 'day'], { name: 'network_sightings_net_day_idx' });

  pgm.addColumns('risk_decisions', { net_hash: { type: 'text' } });
  // the per-network signup cap counts recent sign-ups by network
  pgm.createIndex('risk_decisions', ['net_hash', 'created_at'], { name: 'risk_decisions_net_hash_created_at_idx' });
  // linking and the ranks' pair check start from one account's decisions
  pgm.createIndex('risk_decisions', ['user_id', 'created_at'], { name: 'risk_decisions_user_created_at_idx' });
  pgm.sql(`UPDATE risk_decisions SET ip_hash = NULL WHERE ip_hash IS NOT NULL`);

  pgm.sql(`UPDATE rating_pair_signals SET shared_ip = false WHERE shared_ip`);

  pgm.sql(`DELETE FROM auth_lockouts WHERE scope = 'ip'`);
};

export const down = (pgm) => {
  pgm.dropIndex('risk_decisions', ['user_id', 'created_at'], { name: 'risk_decisions_user_created_at_idx' });
  pgm.dropIndex('risk_decisions', ['net_hash', 'created_at'], { name: 'risk_decisions_net_hash_created_at_idx' });
  pgm.dropColumns('risk_decisions', ['net_hash']);
  pgm.dropTable('network_sightings');
};
