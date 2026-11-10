// Small wrapper around localStorage. Storage can be blocked (private windows,
// strict settings), so every call is guarded and the app works without it.
const PREFIX = 'turn-the-page:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not saved; nothing else to do.
  }
}
