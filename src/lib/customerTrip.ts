// Small pure helpers for the customer booking screens.

export type GeoFailure = 'denied' | 'unavailable' | 'timeout';

/** Plain-language message for a failed "Use my location" tap. The form still works by typing. */
export function geoFailureMessage(code: number | undefined): string {
  const kind: GeoFailure = code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable';
  if (kind === 'denied') return 'Location is blocked for this site. Type your pickup instead, or allow location in your browser settings.';
  if (kind === 'timeout') return 'Finding your location took too long. Try again, or type your pickup.';
  return "Couldn't find your location. Type your pickup instead.";
}

/** Address text from a reverse-geocode response (Ola Maps or Nominatim). Null when nothing usable. */
export function addressFromReverse(payload: unknown): string | null {
  const p = payload as {
    results?: Array<{ formatted_address?: unknown }>;
    display_name?: unknown;
  } | null;
  const ola = p?.results?.[0]?.formatted_address;
  if (typeof ola === 'string' && ola.trim()) return ola.trim();
  if (typeof p?.display_name === 'string' && p.display_name.trim()) return p.display_name.trim();
  return null;
}

export interface TripDay {
  label: string;
  date: string;
}

/** Day 1, Day 2, ... for a multi-day trip starting on `startDate` (YYYY-MM-DD). Empty for a bad date. */
export function tripDays(startDate: string, days: number): TripDay[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const count = Math.max(0, Math.min(30, Math.floor(days)));
  if (!match || count === 0) return [];
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return Array.from({ length: count }, (_, i) => ({
    label: `Day ${i + 1}`,
    date: new Date(y, m - 1, d + i).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
  }));
}

/** Text of the main button on the summary: the fare when known, else a plain confirm. */
export function confirmLabel(fare: number | undefined): string {
  return fare !== undefined && Number.isFinite(fare) ? `Book for ₹${fare.toLocaleString('en-IN')}` : 'Confirm booking';
}

/** Which optional fields hold a value or an error, so "More options" can open itself. */
export function shouldOpenMore(
  data: { passengerCount: number; notes: string; flightNumber: string },
  errors: Record<string, string | undefined>,
): boolean {
  return data.passengerCount > 1 || data.notes.trim() !== '' || data.flightNumber.trim() !== '' || !!errors.notes;
}
