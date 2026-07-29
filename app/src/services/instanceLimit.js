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
