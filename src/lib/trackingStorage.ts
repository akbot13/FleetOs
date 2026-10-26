// The tracking token of the customer's latest booking, kept on this device so the live map
// can be reopened. The same token in a link (?track=...) opens it on any device.
const STORAGE_KEY = 'fleetos_tracking';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTrackingToken(value: string | null | undefined): value is string {
  return !!value && UUID_PATTERN.test(value);
}

export function saveTrackingToken(token: string) {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage can be blocked (private window); the booking still works without it.
  }
}

export function readSavedTrackingToken(): string | null {
  try {
    const token = localStorage.getItem(STORAGE_KEY);
    return isTrackingToken(token) ? token : null;
  } catch {
    return null;
  }
}

export function clearSavedTrackingToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function readTrackingTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.search).get('track');
  return isTrackingToken(token) ? token : null;
}

export function trackingLink(token: string) {
  return `${window.location.origin}/?track=${token}`;
}

export function clearTrackingTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('track')) return;
  url.searchParams.delete('track');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}
