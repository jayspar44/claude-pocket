import { DEFAULT_MAX_INSTANCES } from './ConnectionManager';

export { DEFAULT_MAX_INSTANCES };

/**
 * The relay is authoritative: it is the side that enforces the cap and throws
 * "Maximum instances (N) reached". The app mirrors it so a tab that cannot work
 * is never created, and falls back to the default until health is fetched.
 */
export function canAddInstance(currentCount, relayLimit) {
  const limit = Number.isFinite(relayLimit) && relayLimit > 0
    ? relayLimit
    : DEFAULT_MAX_INSTANCES;
  if (currentCount >= limit) {
    return { ok: false, reason: 'instance-limit', limit };
  }
  return { ok: true };
}
