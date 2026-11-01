import { describe, expect, it } from 'vitest';
import { firstErrorField, validateBooking, type BookingValidationInput } from './bookingValidation';

const now = new Date('2030-01-05T09:00:00');
const ok: BookingValidationInput = {
  tripType: 'local',
  pickup: 'A',
  drop: 'B',
  customerName: 'Asha',
  customerPhone: '9876543210',
  date: '2030-01-05',
  time: '10:00',
};

describe('validateBooking', () => {
  it('accepts a complete booking', () => {
    expect(validateBooking(ok, now)).toEqual({});
  });
  it('asks for pickup and drop on local trips', () => {
    const e = validateBooking({ ...ok, pickup: ' ', drop: '' }, now);
    expect(e.pickup).toBeTruthy();
    expect(e.drop).toBeTruthy();
  });
  it('needs no drop for airport and city tour', () => {
    expect(validateBooking({ ...ok, tripType: 'airport', drop: '' }, now)).toEqual({});
    expect(validateBooking({ ...ok, tripType: 'city_tour', drop: '' }, now)).toEqual({});
  });
  it('needs a drop for intercity and multi-day', () => {
    expect(validateBooking({ ...ok, tripType: 'intercity', drop: '' }, now).drop).toBeTruthy();
    expect(validateBooking({ ...ok, tripType: 'multiday', drop: '' }, now).drop).toBeTruthy();
  });
  it('wants a name and a 10-digit phone', () => {
    const e = validateBooking({ ...ok, customerName: '  ', customerPhone: '12345' }, now);
    expect(e.name).toBeTruthy();
    expect(e.phone).toBe('Enter a 10-digit mobile number');
  });
  it('rejects a time that has passed', () => {
    expect(validateBooking({ ...ok, time: '09:00' }, now).when).toBe('Choose a time later than now');
    expect(validateBooking({ ...ok, date: '2030-01-04' }, now).when).toBe('Choose a time later than now');
  });
  it('asks for a date and time when missing', () => {
    expect(validateBooking({ ...ok, date: '' }, now).when).toBe('Choose a date and time');
  });
});

describe('firstErrorField', () => {
  it('returns the topmost field', () => {
    expect(firstErrorField({ phone: 'x', name: 'y' })).toBe('name');
    expect(firstErrorField({ when: 'x', pickup: 'y' })).toBe('pickup');
    expect(firstErrorField({})).toBeNull();
  });
});
