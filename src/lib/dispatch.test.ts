import { describe, it, expect } from 'vitest';
import { rankDrivers } from './dispatch';
import { metersBetween } from './geo';

const pickup = { lat: 26.9124, lng: 75.7873 }; // central Jaipur
const driver = (id: number, lat: number | null, lng: number | null) => ({ id, name: `D${id}`, location_lat: lat, location_lng: lng });

describe('metersBetween', () => {
  it('is zero for the same point and about 11 km per 0.1 degree of latitude', () => {
    expect(metersBetween(pickup, pickup)).toBe(0);
    expect(metersBetween(pickup, { lat: pickup.lat + 0.1, lng: pickup.lng })).toBeGreaterThan(11000);
    expect(metersBetween(pickup, { lat: pickup.lat + 0.1, lng: pickup.lng })).toBeLessThan(11200);
  });
});

describe('rankDrivers', () => {
  it('puts the nearest driver first by real distance, not list order', () => {
    const far = driver(1, 26.99, 75.79);   // ~8.6 km north
    const near = driver(2, 26.915, 75.788); // ~0.3 km
    const ranked = rankDrivers([far, near], pickup, {});
    expect(ranked.map(d => d.id)).toEqual([2, 1]);
    expect(ranked[0].reason).toMatch(/^Nearest/);
    expect(ranked[0].distanceKm).toBeLessThan(1);
  });

  it('ranks busy drivers last with score 0', () => {
    const busyNear = driver(1, 26.913, 75.788);
    const freeFar = driver(2, 26.99, 75.79);
    const ranked = rankDrivers([busyNear, freeFar], pickup, { 1: '2026-10-25T10:00:00Z' });
    expect(ranked.map(d => d.id)).toEqual([2, 1]);
    expect(ranked[1]).toMatchObject({ isBusy: true, score: 0 });
  });

  it('never invents a distance when the driver has no location or the pickup is unknown', () => {
    const noGps = driver(1, null, null);
    const withGps = driver(2, 26.95, 75.8);
    const ranked = rankDrivers([noGps, withGps], pickup, {});
    expect(ranked.map(d => d.id)).toEqual([2, 1]);
    expect(ranked[1]).toMatchObject({ distanceKm: null, etaMinutes: null, reason: 'No recent location' });

    const unknownPickup = rankDrivers([withGps], null, {});
    expect(unknownPickup[0]).toMatchObject({ distanceKm: null, reason: 'Pickup not on map' });
  });
});
