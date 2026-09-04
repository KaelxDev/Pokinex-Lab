const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const JITTER_MS = 1000;

export function getReconnectDelay(attempt, random = Math.random) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const exponential = Math.min(
    INITIAL_RECONNECT_DELAY_MS * 2 ** (safeAttempt - 1),
    MAX_RECONNECT_DELAY_MS,
  );
  const jitter = Math.max(0, Math.min(1, random())) * JITTER_MS;
  return Math.round(exponential + jitter);
}

export function getReconnectSeconds(attempt, random = Math.random) {
  return Math.ceil(getReconnectDelay(attempt, random) / 1000);
}
