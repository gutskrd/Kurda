/**
 * A deleted child profile takes its security-log events with it, as the privacy policy promises that nothing a child
 * did outlives the profile. The log stays append-only for everyone else: a delete inside its retention passes only
 * under a transaction-scoped flag (`SET LOCAL kurda.child_erase = 'on'`), and only for rows whose user is a child
 * account, which the child deletion sets just before it removes the account.
 */

const GUARD_BEFORE = `BEGIN
       IF TG_OP = 'DELETE' THEN
         -- in brackets: unbracketed, the IF would end at the CASE's own THEN
         IF OLD.occurred_at < now() - (CASE WHEN OLD.severity IN ('info','notice') THEN interval '90 days' ELSE interval '365 days' END) THEN
           RETURN OLD;
         END IF;
         RAISE EXCEPTION 'security_events keeps every event for its whole retention period';
       END IF;
       -- the one change allowed: forgetting the sealed address, and nothing else
       IF NEW.ip_sealed IS NULL AND (to_jsonb(NEW) - 'ip_sealed') = (to_jsonb(OLD) - 'ip_sealed') THEN
         RETURN NEW;
       END IF;
       RAISE EXCEPTION 'security_events is append-only';
     END;`;

const GUARD_AFTER = `BEGIN
       IF TG_OP = 'DELETE' THEN
         -- in brackets: unbracketed, the IF would end at the CASE's own THEN
         IF OLD.occurred_at < now() - (CASE WHEN OLD.severity IN ('info','notice') THEN interval '90 days' ELSE interval '365 days' END) THEN
           RETURN OLD;
         END IF;
         -- a child profile being deleted takes its events with it, and only under the deletion's own flag
         IF current_setting('kurda.child_erase', true) = 'on'
            AND (EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id AND u.kind = 'child')
                 OR EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.actor_id AND u.kind = 'child')) THEN
           RETURN OLD;
         END IF;
         RAISE EXCEPTION 'security_events keeps every event for its whole retention period';
       END IF;
       -- the one change allowed: forgetting the sealed address, and nothing else
       IF NEW.ip_sealed IS NULL AND (to_jsonb(NEW) - 'ip_sealed') = (to_jsonb(OLD) - 'ip_sealed') THEN
         RETURN NEW;
       END IF;
       RAISE EXCEPTION 'security_events is append-only';
     END;`;

export const up = (pgm) => {
  pgm.createFunction('security_events_guard', [], { returns: 'trigger', language: 'plpgsql', replace: true }, GUARD_AFTER);
};

export const down = (pgm) => {
  pgm.createFunction('security_events_guard', [], { returns: 'trigger', language: 'plpgsql', replace: true }, GUARD_BEFORE);
};
