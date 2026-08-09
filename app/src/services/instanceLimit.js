/**
 * The relay is authoritative: it is the side that enforces the cap and throws
 * "Maximum instances (N) reached", which the app now surfaces as a plain
 * pty-error on the tab that hit it.
 *
 * So this mirrors the relay's cap when the relay has told us what it is, and
 * defers to the relay when it has not. There is deliberately no local default:
 * a guessed cap can only be wrong in two directions, and the dangerous one is
 * guessing HIGH - a relay running MAX_INSTANCES=3 with a failed /api/health
 * fetch would let the app create ten tabs it refuses. Guessing is also what
 * made the failure silent; the relay's own refusal explains itself.
 */
export function canAddInstance(currentCount, relayLimit) {
  if (!Number.isFinite(relayLimit) || relayLimit <= 0) {
    return { ok: true };
  }
  if (currentCount >= relayLimit) {
    return { ok: false, reason: 'instance-limit', limit: relayLimit };
  }
  return { ok: true };
}

/**
 * Holds the relay's cap, and keeps trying until it has one.
 *
 * Deferring to the relay while the limit is unknown is only safe if "unknown"
 * is temporary. Fetched once at mount and never again, it is not: open the app
 * before Tailscale is up, or during a relay deploy, and that single /api/health
 * call fails and canAddInstance goes unconditionally permissive for the whole
 * session. The user creates 15 or 30 tabs, each persisted to localStorage, and
 * every one past the real cap is refused when the relay comes back.
 *
 * So refresh() is callable from anything that suggests the relay is reachable -
 * it is wired to mount and to a connection reaching CONNECTED, both of which
 * already happen, rather than to a polling loop of its own. It costs nothing to
 * over-call: once the limit is known it never fetches again, and concurrent
 * calls share the one in-flight request.
 *
 * @param {Object} deps
 * @param {Function} deps.fetchHealth - returns a promise of the /api/health response
 * @param {Function} [deps.onLimit] - called once, with the limit, when it arrives
 */
export function createInstanceLimitSource({ fetchHealth, onLimit = () => {} }) {
  let limit = null;
  let inFlight = null;

  return {
    get limit() { return limit; },

    refresh() {
      if (limit !== null) return Promise.resolve(limit);
      if (inFlight) return inFlight;

      inFlight = Promise.resolve()
        .then(() => fetchHealth())
        .then((res) => {
          const max = res?.data?.maxInstances;
          if (Number.isFinite(max) && max > 0) {
            limit = max;
            onLimit(max);
          }
          return limit;
        })
        // Swallowed on purpose: an unreachable relay is the ordinary case this
        // exists for, and the next caller simply tries again.
        .catch(() => null)
        .finally(() => { inFlight = null; });

      return inFlight;
    },
  };
}
