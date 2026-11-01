import type { RequestTripType } from './bookingRequest';

export interface BookingValidationInput {
  tripType: RequestTripType;
  pickup: string;
  drop: string;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
}

export type BookingField = 'pickup' | 'drop' | 'name' | 'phone' | 'when';
export type BookingErrors = Partial<Record<BookingField, string>>;

/** Fields in the order they appear on the form, so the first error is the topmost one. */
export const FIELD_ORDER: BookingField[] = ['pickup', 'drop', 'name', 'phone', 'when'];

export function validateBooking(data: BookingValidationInput, now: Date = new Date()): BookingErrors {
  const errors: BookingErrors = {};
  const airport = data.tripType === 'airport';

  if (!data.pickup.trim()) {
    errors.pickup = airport ? 'Enter your address' : 'Enter a pickup location';
  }
  if (['local', 'intercity', 'multiday'].includes(data.tripType) && !data.drop.trim()) {
    errors.drop = data.tripType === 'local' ? 'Enter a drop location' : 'Enter a destination city';
  }
  if (!data.customerName.trim()) {
    errors.name = 'Enter your name';
  }
  if (data.customerPhone.replace(/\D/g, '').length !== 10) {
    errors.phone = 'Enter a 10-digit mobile number';
  }
  if (!data.date || !data.time) {
    errors.when = 'Choose a date and time';
  } else {
    const at = new Date(`${data.date}T${data.time}`);
    if (Number.isNaN(at.getTime()) || at <= now) errors.when = 'Choose a time later than now';
  }
  return errors;
}

export function firstErrorField(errors: BookingErrors): BookingField | null {
  return FIELD_ORDER.find((f) => errors[f]) ?? null;
}
