import { describe, expect, it } from 'vitest';
import { addressFromReverse, confirmLabel, geoFailureMessage, shouldOpenMore, tripDays } from './customerTrip';

describe('geoFailureMessage', () => {
  it('explains each failure', () => {
    expect(geoFailureMessage(1)).toMatch(/blocked/);
    expect(geoFailureMessage(3)).toMatch(/too long/);
    expect(geoFailureMessage(2)).toMatch(/Type your pickup/);
    expect(geoFailureMessage(undefined)).toMatch(/Type your pickup/);
  });
});

describe('addressFromReverse', () => {
  it('reads Ola and Nominatim shapes', () => {
    expect(addressFromReverse({ results: [{ formatted_address: ' MI Road, Jaipur ' }] })).toBe('MI Road, Jaipur');
    expect(addressFromReverse({ display_name: 'Tonk Road, Jaipur' })).toBe('Tonk Road, Jaipur');
  });
  it('returns null for nothing usable', () => {
    expect(addressFromReverse(null)).toBeNull();
    expect(addressFromReverse({ results: [] })).toBeNull();
    expect(addressFromReverse({ display_name: '  ' })).toBeNull();
  });
});

describe('tripDays', () => {
  it('lists one entry per day, crossing month ends', () => {
    const days = tripDays('2026-11-29', 3);
    expect(days.map(d => d.label)).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(days[2].date).toMatch(/1 Dec/);
  });
  it('is empty for a bad date or zero days', () => {
    expect(tripDays('', 2)).toEqual([]);
    expect(tripDays('2026-11-01', 0)).toEqual([]);
  });
});

describe('confirmLabel', () => {
  it('shows the fare or falls back', () => {
    expect(confirmLabel(1234)).toBe('Book for ₹1,234');
    expect(confirmLabel(undefined)).toBe('Confirm booking');
    expect(confirmLabel(NaN)).toBe('Confirm booking');
  });
});

describe('shouldOpenMore', () => {
  const base = { passengerCount: 1, notes: '', flightNumber: '' };
  it('stays closed when nothing optional is set', () => {
    expect(shouldOpenMore(base, {})).toBe(false);
  });
  it('opens for a filled field', () => {
    expect(shouldOpenMore({ ...base, notes: 'hi' }, {})).toBe(true);
    expect(shouldOpenMore({ ...base, passengerCount: 3 }, {})).toBe(true);
    expect(shouldOpenMore(base, { notes: 'too long' })).toBe(true);
  });
});
