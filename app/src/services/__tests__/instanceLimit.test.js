import { describe, it, expect, vi } from 'vitest';
import { canAddInstance, createInstanceLimitSource } from '../instanceLimit';

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

describe('createInstanceLimitSource', () => {
  const health = (maxInstances) => ({ data: { maxInstances } });

  // The regression: deferring to the relay while the limit is unknown is only
  // safe if "unknown" is temporary. /api/health was fetched once at mount and
  // never again, so an app opened before Tailscale is up - or during a relay
  // deploy - spent the whole session with no cap, letting the user create tabs
  // the relay refuses (and, before the first fix in this wave, park dead).
  it('keeps trying after a failed fetch, and takes the limit when it arrives', async () => {
    const fetchHealth = vi.fn()
      .mockRejectedValueOnce(new Error('Network Error'))   // relay not reachable yet
      .mockResolvedValueOnce(health(3));                   // ...and then it is
    const onLimit = vi.fn();
    const source = createInstanceLimitSource({ fetchHealth, onLimit });

    await source.refresh();                    // at mount
    expect(source.limit).toBe(null);
    expect(canAddInstance(9, source.limit)).toEqual({ ok: true });

    await source.refresh();                    // a later connect
    expect(source.limit).toBe(3);
    expect(onLimit).toHaveBeenCalledWith(3);
    expect(canAddInstance(3, source.limit)).toEqual({ ok: false, reason: 'instance-limit', limit: 3 });
  });

  // Wired to every CONNECTED transition, so over-calling has to be free.
  it('stops fetching once the limit is known', async () => {
    const fetchHealth = vi.fn().mockResolvedValue(health(5));
    const source = createInstanceLimitSource({ fetchHealth });

    await source.refresh();
    await source.refresh();
    await source.refresh();

    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(source.limit).toBe(5);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    const fetchHealth = vi.fn().mockResolvedValue(health(4));
    const source = createInstanceLimitSource({ fetchHealth });

    await Promise.all([source.refresh(), source.refresh(), source.refresh()]);

    expect(fetchHealth).toHaveBeenCalledTimes(1);
  });

  // A relay that answers without the field is no more informative than one that
  // did not answer at all - and must not latch a bogus limit.
  it('ignores a response with no usable maxInstances and tries again', async () => {
    const fetchHealth = vi.fn()
      .mockResolvedValueOnce({ data: { status: 'ok' } })
      .mockResolvedValueOnce(health(0))
      .mockResolvedValueOnce(health(2));
    const source = createInstanceLimitSource({ fetchHealth });

    await source.refresh();
    expect(source.limit).toBe(null);
    await source.refresh();
    expect(source.limit).toBe(null);
    await source.refresh();
    expect(source.limit).toBe(2);
  });
});
