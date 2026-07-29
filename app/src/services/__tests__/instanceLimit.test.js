import { describe, it, expect } from 'vitest';
import { canAddInstance } from '../instanceLimit';

describe('canAddInstance', () => {
  it('allows up to the limit', () => {
    expect(canAddInstance(0, 10)).toEqual({ ok: true });
    expect(canAddInstance(9, 10)).toEqual({ ok: true });
  });

  it('refuses at the limit, reporting it', () => {
    expect(canAddInstance(10, 10)).toEqual({ ok: false, reason: 'instance-limit', limit: 10 });
  });

  // Finding 5: this used to fall back to a local default of 10. With a relay
  // running MAX_INSTANCES=3 and a /api/health fetch that failed (it is fetched
  // once, at mount, and never retried), that default RAISED the cap: the app
  // created tabs the relay refuses. There is no honest local guess, so an
  // unknown relay limit now defers to the relay, whose refusal the tab shows.
  it('defers to the relay when its limit is unknown', () => {
    expect(canAddInstance(10, null)).toEqual({ ok: true });
    expect(canAddInstance(10, undefined)).toEqual({ ok: true });
    expect(canAddInstance(10, 0)).toEqual({ ok: true });
    expect(canAddInstance(10, NaN)).toEqual({ ok: true });
  });

  it('honours a relay limit different from the default', () => {
    expect(canAddInstance(10, 20)).toEqual({ ok: true });
    expect(canAddInstance(20, 20)).toEqual({ ok: false, reason: 'instance-limit', limit: 20 });
  });
});
