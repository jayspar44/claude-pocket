import { describe, it, expect } from 'vitest';
import { instancesToReconnectAfterStopAll } from '../stopAll';

describe('instancesToReconnectAfterStopAll', () => {
  // The regression, exactly: the relay was restarted while the app was open, so
  // every PtyManager and the whole stoppedByUserAt map are gone while the tabs
  // sit in RECONNECTING (which counts as live). deleteAll() finds an empty
  // registry and records nothing. Reconnecting the live tabs re-sends
  // set-instance for ids with no stop record, and each arms a deferred start -
  // the dialog promised nothing would restart, and it started everything.
  it('reconnects nothing when the relay stopped nothing', () => {
    expect(instancesToReconnectAfterStopAll(['a', 'b', 'c'], [])).toEqual([]);
  });

  // The partial case, which a bare count check misses: one manager survived, so
  // count is 1 and non-zero, but tabs b and c still have no stop record.
  it('reconnects only the tabs the relay actually stopped', () => {
    expect(instancesToReconnectAfterStopAll(['a', 'b', 'c'], ['a'])).toEqual(['a']);
  });

  it('reconnects every live tab when the relay stopped them all', () => {
    expect(instancesToReconnectAfterStopAll(['a', 'b'], ['b', 'a'])).toEqual(['a', 'b']);
  });

  // A server instance with no tab of its own must not conjure a connection: the
  // result is a subset of what was live, never a superset.
  it('never reconnects an instance that was not live', () => {
    expect(instancesToReconnectAfterStopAll(['a'], ['a', 'server-only'])).toEqual(['a']);
  });

  // An unusable response is not evidence that anything was stopped. The safe
  // direction of a wrong answer is an offline tab, never an unasked-for CLI.
  it('treats a missing or malformed removed list as nothing stopped', () => {
    expect(instancesToReconnectAfterStopAll(['a'], undefined)).toEqual([]);
    expect(instancesToReconnectAfterStopAll(['a'], null)).toEqual([]);
    expect(instancesToReconnectAfterStopAll(['a'], 3)).toEqual([]);
    expect(instancesToReconnectAfterStopAll(undefined, ['a'])).toEqual([]);
  });
});
