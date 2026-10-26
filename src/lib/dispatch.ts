import { metersBetween, type LatLng } from './geo';

// shortcut: straight-line distance at an average city speed, upgrade to a routing ETA if dispatch needs precision.
const CITY_MINUTES_PER_KM = 3.2;

export interface DispatchDriver {
  id: number;
  location_lat: number | null;
  location_lng: number | null;
}

export type RankedDriver<D extends DispatchDriver> = D & {
  distanceKm: number | null;
  etaMinutes: number | null;
  score: number;
  reason: string;
  isBusy: boolean;
  conflictTime?: string;
};

// Ranks free drivers for a booking: available before busy, then nearest to the pickup by their
// last GPS position. Drivers with no location, or a pickup we couldn't place on the map, get no
// distance at all rather than a made-up one, and rank after drivers whose distance is known.
export function rankDrivers<D extends DispatchDriver>(
  drivers: D[],
  pickup: LatLng | null,
  conflicts: Record<number, string | null>,
  formatTime: (iso: string) => string = (iso) => iso,
): RankedDriver<D>[] {
  const ranked = drivers.map((driver) => {
    const conflictAt = conflicts[driver.id] ?? null;
    const hasLocation = driver.location_lat != null && driver.location_lng != null;
    const distanceKm = pickup && hasLocation
      ? +(metersBetween({ lat: driver.location_lat!, lng: driver.location_lng! }, pickup) / 1000).toFixed(1)
      : null;
    const etaMinutes = distanceKm == null ? null : Math.max(1, Math.round(distanceKm * CITY_MINUTES_PER_KM));
    const score = conflictAt ? 0 : distanceKm == null ? 10 : Math.max(Math.round(100 - distanceKm * 5), 20);
    const reason = conflictAt
      ? `Busy at ${formatTime(conflictAt)}`
      : distanceKm == null
        ? (hasLocation ? 'Pickup not on map' : 'No recent location')
        : `${distanceKm} km from pickup`;
    return { ...driver, distanceKm, etaMinutes, score, reason, isBusy: !!conflictAt, conflictTime: conflictAt ?? undefined };
  });

  ranked.sort((a, b) => {
    if (a.isBusy !== b.isBusy) return a.isBusy ? 1 : -1;
    if ((a.distanceKm == null) !== (b.distanceKm == null)) return a.distanceKm == null ? 1 : -1;
    return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
  });

  const nearest = ranked[0];
  if (nearest && !nearest.isBusy && nearest.distanceKm != null) nearest.reason = `Nearest, ${nearest.distanceKm} km from pickup`;
  return ranked;
}
