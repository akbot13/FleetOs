import { describe, it, expect } from 'vitest';
import {
  whatsappNumber, whatsappLink, customerConfirmationMessage, customerDriverMessage, driverTripMessage,
} from './whatsappMessages';

const booking = {
  id: 42, customer_name: 'Riya', customer_phone: '+91 98290 12345', pickup: 'Jaipur Junction', drop: 'Hawa Mahal',
  scheduled_at: '2026-11-02T04:30:00Z', fare: 1850, notes: 'Two bags', tracking_token: 'abc-123',
};
const driver = { name: 'Dinesh Meena', phone: '+919876543210', vehicle_model: 'Maruti Swift', plate_number: 'RJ14 AB 1234' };

describe('whatsappNumber', () => {
  it('accepts Indian numbers in any common form', () => {
    expect(whatsappNumber('98290 12345')).toBe('919829012345');
    expect(whatsappNumber('+91-98290-12345')).toBe('919829012345');
    expect(whatsappNumber('09829012345')).toBe('919829012345');
  });

  it('refuses anything else', () => {
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappLink('', 'hi')).toBeNull();
  });
});

describe('messages', () => {
  it('confirms the booking with the tracking link, in India time', () => {
    const text = customerConfirmationMessage(booking, 'Anil Cabs', 'https://fleetoss.vercel.app/');
    expect(text).toContain('your Anil Cabs booking #42 is confirmed');
    expect(text).toContain('Fare: ₹1,850');
    expect(text).toContain('10:00 am');
    expect(text).toContain('Track your booking: https://fleetoss.vercel.app/?track=abc-123');
  });

  it("gives the customer the driver's details", () => {
    const text = customerDriverMessage(booking, driver, 'Anil Cabs', 'https://fleetoss.vercel.app');
    expect(text).toContain('Driver: Dinesh Meena');
    expect(text).toContain('Car: Maruti Swift, RJ14 AB 1234');
    expect(text).toContain('Follow your cab live: https://fleetoss.vercel.app/?track=abc-123');
  });

  it('gives the driver the trip with a map link and leaves out missing parts', () => {
    const text = driverTripMessage({ ...booking, drop: null, notes: null }, 'Anil Cabs');
    expect(text).toContain('Customer: Riya (+91 98290 12345)');
    expect(text).toContain('https://www.google.com/maps/search/?api=1&query=Jaipur%20Junction');
    expect(text).not.toContain('Drop:');
    expect(text).not.toContain('Note:');
  });
});
