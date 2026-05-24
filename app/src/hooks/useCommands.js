import { useState, useEffect, useCallback } from 'react';
import { commandsApi } from '../api/relay-api';
import { storage } from '../utils/storage';

const getCacheKey = (cliType, instanceId) =>
  `repo-cmds:${cliType || 'claude'}${instanceId ? `:${instanceId}` : ''}`;

function getCached(cliType, instanceId) {
  return storage.getJSON(getCacheKey(cliType, instanceId), []);
}

function setCached(commands, cliType, instanceId) {
  try {
    storage.setJSON(getCacheKey(cliType, instanceId), commands);
  } catch {
    // Ignore quota errors
  }
}

async function fetchWithRetry(instanceId, retries = 1) {
  try {
    return await commandsApi.list(instanceId);
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return fetchWithRetry(instanceId, retries - 1);
    }
    throw err;
  }
}

export function useCommands(instanceId, cliType, { enabled = true } = {}) {
  const [commands, setCommands] = useState(() => getCached(cliType, instanceId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRetry(instanceId);
      const fresh = response.data.commands || [];
      setCommands(fresh);
      setCached(fresh, cliType, instanceId);
    } catch (err) {
      setError('Unable to load commands');
      console.error('useCommands fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [instanceId, cliType]);

  useEffect(() => {
    if (!enabled) return;
    setCommands(getCached(cliType, instanceId));
    refresh();
  }, [enabled, instanceId, cliType, refresh]);

  return { commands, loading, error, refresh };
}
