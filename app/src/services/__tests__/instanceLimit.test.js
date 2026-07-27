import { describe, it, expect } from 'vitest';
import { canAddInstance, DEFAULT_MAX_INSTANCES } from '../instanceLimit';

describe('canAddInstance', () => {
  it('allows up to the limit', () => {
    expect(canAddInstance(0, 10)).toEqual({ ok: true });
    expect(canAddInstance(9, 10)).toEqual({ ok: true });
  });

  it('refuses at the limit, reporting it', () => {
    expect(canAddInstance(10, 10)).toEqual({ ok: false, reason: 'instance-limit', limit: 10 });
  });

  it('falls back to the default when the relay limit is unknown', () => {
    expect(canAddInstance(10, null)).toEqual({
      ok: false, reason: 'instance-limit', limit: DEFAULT_MAX_INSTANCES,
    });
    expect(DEFAULT_MAX_INSTANCES).toBe(10);
  });

  it('honours a relay limit different from the default', () => {
    expect(canAddInstance(10, 20)).toEqual({ ok: true });
    expect(canAddInstance(20, 20)).toEqual({ ok: false, reason: 'instance-limit', limit: 20 });
  });
});
