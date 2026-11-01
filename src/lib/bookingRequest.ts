// Builds the booking request sent to the database. The fare is never part of it: quote_fare()
// and create_customer_booking() compute it on the server from the fleet's rate card.

export type RequestTripType = 'local' | 'airport' | 'city_tour' | 'intercity' | 'multiday';

export interface BookingRequestInput {
  pickup: string;
  drop: string;
  date: string;
  time: string;
  tripType: RequestTripType;
  customerName: string;
  customerPhone: string;
  hubCity: string;
  passengerCount: number;
  vehicleClass: '4_seater' | '6_seater';
  notes: string;
  airportDirection: 'arriving' | 'departing';
  flightNumber: string;
  estimatedHours: number;
  stops: string[];
  isRoundTrip: boolean;
  returnDate: string;
  numberOfDays: number;
  driverStayRequired: boolean;
}

export const NOTES_LIMIT = 1000;
const FLIGHT_NUMBER_LIMIT = 10;

const tripTypeToDb: Record<string, string> = {
  local: 'city',
  city_tour: 'sightseeing',
  intercity: 'outstation',
  multiday: 'outstation',
  airport: 'airport',
};

export function dbTripType(type: string): string {
  return tripTypeToDb[type] ?? type;
}

/** True for trips the database stores as outstation. */
export function isOutstation(type: string): boolean {
  return dbTripType(type) === 'outstation';
}

export function airportLabel(hubCity: string): string {
  return `${hubCity || 'City'} Airport`;
}

/** Pickup and drop as shown to the customer and saved: the airport is one end of an airport trip. */
export function tripEnds(
  data: Pick<BookingRequestInput, 'tripType' | 'airportDirection' | 'hubCity' | 'pickup' | 'drop'>,
) {
  if (data.tripType !== 'airport') return { pickup: data.pickup, drop: data.drop };
  const airport = airportLabel(data.hubCity);
  return data.airportDirection === 'arriving'
    ? { pickup: airport, drop: data.pickup }
    : { pickup: data.pickup, drop: airport };
}

/** One readable line such as "Flight AI 123 · Arriving · 3 passengers". */
export function detailsLine(
  data: Pick<BookingRequestInput, 'tripType' | 'airportDirection' | 'flightNumber' | 'passengerCount'>,
): string {
  const parts: string[] = [];
  if (data.tripType === 'airport') {
    const flight = data.flightNumber.replace(/\s+/g, ' ').trim().slice(0, FLIGHT_NUMBER_LIMIT).toUpperCase();
    if (flight) parts.push(`Flight ${flight}`);
    parts.push(data.airportDirection === 'arriving' ? 'Arriving' : 'Departing');
  }
  const count = Math.max(1, Math.floor(data.passengerCount || 1));
  parts.push(count === 1 ? '1 passenger' : `${count} passengers`);
  return parts.join(' · ');
}

/** The details line first, then the customer's own note, kept within the notes limit. */
export function bookingNotes(
  data: Pick<BookingRequestInput, 'tripType' | 'airportDirection' | 'flightNumber' | 'passengerCount' | 'notes'>,
): string {
  const line = detailsLine(data);
  const note = (data.notes ?? '').trim();
  if (!note) return line;
  const room = NOTES_LIMIT - line.length - 1;
  return room > 0 ? `${line}\n${note.slice(0, room).trimEnd()}` : line.slice(0, NOTES_LIMIT);
}

export function scheduledAtIso(data: Pick<BookingRequestInput, 'date' | 'time'>): string | null {
  if (!data.date || !data.time) return null;
  const at = new Date(`${data.date}T${data.time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function bookingRequest(data: BookingRequestInput) {
  const ends = tripEnds(data);
  return {
    customer_name: data.customerName || null,
    customer_phone: data.customerPhone
      ? '+91' + data.customerPhone.replace(/\D/g, '').slice(-10)
      : null,
    pickup: ends.pickup,
    drop: data.tripType === 'city_tour' ? (data.stops[0] || null) : ends.drop,
    // No date means "now"; the database fills that in.
    scheduled_at: scheduledAtIso(data),
    trip_type: dbTripType(data.tripType),
    vehicle_class: data.vehicleClass,
    notes: bookingNotes(data),
    stops: data.tripType === 'city_tour' && data.stops.length > 0
      ? JSON.stringify(data.stops)
      : null,
    estimated_hours: data.tripType === 'city_tour' ? data.estimatedHours : null,
    return_date: data.isRoundTrip && data.returnDate
      ? new Date(data.returnDate).toISOString()
      : null,
    number_of_days: (data.tripType === 'multiday' || data.tripType === 'intercity') ? data.numberOfDays : null,
    driver_stay_required: data.tripType === 'multiday' ? data.driverStayRequired : null,
  };
}

/**
 * Only the fields quote_fare() reads. Name, phone, notes, pickup and drop are left out so typing
 * them never refetches the quote.
 */
export function fareQuoteInput(data: BookingRequestInput) {
  const r = bookingRequest(data);
  return {
    trip_type: r.trip_type,
    vehicle_class: r.vehicle_class,
    scheduled_at: r.scheduled_at,
    estimated_hours: r.estimated_hours,
    number_of_days: r.number_of_days,
    driver_stay_required: r.driver_stay_required,
    return_date: r.return_date,
  };
}
