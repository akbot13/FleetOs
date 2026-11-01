import { describe, expect, it } from 'vitest';
import {
  bookingNotes,
  bookingRequest,
  detailsLine,
  fareQuoteInput,
  isOutstation,
  tripEnds,
  NOTES_LIMIT,
  type BookingRequestInput,
} from './bookingRequest';

const base: BookingRequestInput = {
  pickup: '12 MI Road',
  drop: 'Amber Fort',
  date: '2030-01-05',
  time: '10:30',
  tripType: 'local',
  customerName: 'Asha',
  customerPhone: '9876543210',
  hubCity: 'Jaipur',
  passengerCount: 1,
  vehicleClass: '4_seater',
  notes: '',
  airportDirection: 'arriving',
  flightNumber: '',
  estimatedHours: 4,
  stops: [],
  isRoundTrip: false,
  returnDate: '',
  numberOfDays: 1,
  driverStayRequired: false,
};

describe('tripEnds', () => {
  it('uses the airport as pickup when arriving', () => {
    const ends = tripEnds({ ...base, tripType: 'airport', airportDirection: 'arriving' });
    expect(ends).toEqual({ pickup: 'Jaipur Airport', drop: '12 MI Road' });
  });
  it('uses the airport as drop when departing', () => {
    const ends = tripEnds({ ...base, tripType: 'airport', airportDirection: 'departing' });
    expect(ends).toEqual({ pickup: '12 MI Road', drop: 'Jaipur Airport' });
  });
  it('falls back to a generic label without a city', () => {
    expect(tripEnds({ ...base, tripType: 'airport', hubCity: '' }).pickup).toBe('City Airport');
  });
  it('leaves other trips alone', () => {
    expect(tripEnds(base)).toEqual({ pickup: '12 MI Road', drop: 'Amber Fort' });
  });
});

describe('notes', () => {
  it('writes flight, direction and passengers ahead of the note', () => {
    const notes = bookingNotes({
      tripType: 'airport', airportDirection: 'arriving', flightNumber: ' ai  123 ', passengerCount: 3, notes: ' Call me ',
    });
    expect(notes).toBe('Flight AI 123 · Arriving · 3 passengers\nCall me');
  });
  it('skips the flight when blank', () => {
    expect(detailsLine({ tripType: 'airport', airportDirection: 'departing', flightNumber: '', passengerCount: 1 }))
      .toBe('Departing · 1 passenger');
  });
  it('gives passengers only for other trips', () => {
    expect(detailsLine({ tripType: 'local', airportDirection: 'arriving', flightNumber: 'AI 1', passengerCount: 2 }))
      .toBe('2 passengers');
  });
  it('keeps the total within the limit and the line intact', () => {
    const notes = bookingNotes({
      tripType: 'airport', airportDirection: 'arriving', flightNumber: 'AI123', passengerCount: 2, notes: 'x'.repeat(2000),
    });
    expect(notes.length).toBeLessThanOrEqual(NOTES_LIMIT);
    expect(notes.startsWith('Flight AI123 · Arriving · 2 passengers\n')).toBe(true);
  });
});

describe('bookingRequest', () => {
  it('saves airport ends by direction and the details in notes', () => {
    const r = bookingRequest({
      ...base, tripType: 'airport', drop: '', airportDirection: 'arriving', flightNumber: 'AI 123', passengerCount: 3,
    });
    expect(r.pickup).toBe('Jaipur Airport');
    expect(r.drop).toBe('12 MI Road');
    expect(r.trip_type).toBe('airport');
    expect(r.notes).toBe('Flight AI 123 · Arriving · 3 passengers');
  });
  it('formats the phone and maps trip types', () => {
    const r = bookingRequest({ ...base, tripType: 'multiday', numberOfDays: 3, driverStayRequired: true });
    expect(r.customer_phone).toBe('+919876543210');
    expect(r.trip_type).toBe('outstation');
    expect(r.number_of_days).toBe(3);
    expect(r.driver_stay_required).toBe(true);
  });
  it('uses the first stop as drop for a city tour', () => {
    const r = bookingRequest({ ...base, tripType: 'city_tour', drop: '', stops: ['Hawa Mahal', 'City Palace'] });
    expect(r.drop).toBe('Hawa Mahal');
    expect(r.estimated_hours).toBe(4);
  });
  it('never carries a fare', () => {
    expect(Object.keys(bookingRequest(base))).not.toContain('fare');
  });
});

describe('fareQuoteInput', () => {
  it('ignores name, phone, notes, pickup and drop', () => {
    const a = fareQuoteInput(base);
    const b = fareQuoteInput({ ...base, customerName: 'Ravi', customerPhone: '1111111111', notes: 'hi', pickup: 'x', drop: 'y' });
    expect(b).toEqual(a);
    expect(Object.keys(a)).not.toContain('pickup');
  });
  it('changes with car size and trip type', () => {
    expect(fareQuoteInput({ ...base, vehicleClass: '6_seater' })).not.toEqual(fareQuoteInput(base));
    expect(fareQuoteInput({ ...base, tripType: 'airport' })).not.toEqual(fareQuoteInput(base));
  });
});

describe('isOutstation', () => {
  it('covers intercity and multi-day only', () => {
    expect(isOutstation('intercity')).toBe(true);
    expect(isOutstation('multiday')).toBe(true);
    expect(isOutstation('local')).toBe(false);
  });
});
