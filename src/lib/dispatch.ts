import { metersBetween, type LatLng } from './geo';

// shortcut: straight-line distance at an average city speed, upgrade to a routing ETA if dispatch needs precision.
const CITY_MINUTES_PER_KM = 3.2;

export interface DispatchDriver {
  id: number;
  location_lat: number | null;
  location_lng: number | null;
  vehicle_class?: string | null;
}

export type VehicleClass = '4_seater' | '6_seater';

export const vehicleClassLabel: Record<VehicleClass, string> = {
  '4_seater': '4-seater',
  '6_seater': '6-seater',
};

export type RankedDriver<D extends DispatchDriver> = D & {
  distanceKm: number | null;
  etaMinutes: number | null;
  score: number;
  reason: string;
  isBusy: boolean;
  // The car is too small for the booking; such drivers rank after every compatible driver.
  isIncompatible: boolean;
  conflictTime?: string;
};

// Ranks free drivers for a booking: available before busy, then nearest to the pickup by their
// last GPS position. Drivers with no location, or a pickup we couldn't place on the map, get no
// distance at all rather than a made-up one, and rank after drivers whose distance is known.
// A 4-seater cannot take a 6-seater booking; a missing vehicle_class counts as a 4-seater.
export function rankDrivers<D extends DispatchDriver>(
  drivers: D[],
  pickup: LatLng | null,
  conflicts: Record<number, string | null>,
  formatTime: (iso: string) => string = (iso) => iso,
  neededClass?: VehicleClass,
): RankedDriver<D>[] {
  const ranked = drivers.map((driver) => {
    const conflictAt = conflicts[driver.id] ?? null;
    const hasLocation = driver.location_lat != null && driver.location_lng != null;
    const distanceKm = pickup && hasLocation
      ? +(metersBetween({ lat: driver.location_lat!, lng: driver.location_lng! }, pickup) / 1000).toFixed(1)
      : null;
    const etaMinutes = distanceKm == null ? null : Math.max(1, Math.round(distanceKm * CITY_MINUTES_PER_KM));
    const isIncompatible = neededClass === '6_seater' && (driver.vehicle_class ?? '4_seater') !== '6_seater';
    const score = isIncompatible || conflictAt ? 0 : distanceKm == null ? 10 : Math.max(Math.round(100 - distanceKm * 5), 20);
    const reason = isIncompatible
      ? '4-seater · trip needs 6-seater'
      : conflictAt
      ? `Busy at ${formatTime(conflictAt)}`
      : distanceKm == null
        ? (hasLocation ? 'Pickup not on map' : 'No recent location')
        : `${distanceKm} km from pickup`;
    return { ...driver, distanceKm, etaMinutes, score, reason, isBusy: !isIncompatible && !!conflictAt, isIncompatible, conflictTime: isIncompatible ? undefined : conflictAt ?? undefined };
  });

  ranked.sort((a, b) => {
    if (a.isIncompatible !== b.isIncompatible) return a.isIncompatible ? 1 : -1;
    if (a.isBusy !== b.isBusy) return a.isBusy ? 1 : -1;
    if ((a.distanceKm == null) !== (b.distanceKm == null)) return a.distanceKm == null ? 1 : -1;
    return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
  });

  const nearest = ranked[0];
  if (nearest && !nearest.isBusy && !nearest.isIncompatible && nearest.distanceKm != null) nearest.reason = `Nearest, ${nearest.distanceKm} km from pickup`;
  return ranked;
}
