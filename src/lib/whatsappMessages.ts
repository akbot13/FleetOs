// Ready-to-send WhatsApp messages for the admin. No SMS or WhatsApp provider is connected yet,
// so the admin sends these by hand: the link opens WhatsApp with the message already typed.

export interface MessageBooking {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  pickup: string | null;
  drop: string | null;
  scheduled_at: string | null;
  fare: number | null;
  notes: string | null;
  tracking_token?: string | null;
}

export interface MessageDriver {
  name: string | null;
  phone: string | null;
  vehicle_model: string | null;
  plate_number: string | null;
}

// An Indian mobile number in the form wa.me wants (country code, digits only), or null.
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return null;
}

export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

export function trackingLink(origin: string, token: string | null | undefined): string | null {
  return token ? `${origin.replace(/\/$/, '')}/?track=${token}` : null;
}

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
  : 'as soon as possible';

// Missing parts are left out; '' keeps a blank line between sections.
const lines = (...parts: (string | null | false | undefined)[]) =>
  parts.filter((p): p is string => typeof p === 'string').join('\n');

export function customerConfirmationMessage(b: MessageBooking, brand: string, origin: string) {
  const track = trackingLink(origin, b.tracking_token);
  return lines(
    `Hello${b.customer_name ? ` ${b.customer_name}` : ''}, your ${brand} booking #${b.id} is confirmed.`,
    '',
    `Pickup: ${b.pickup ?? '-'}`,
    b.drop && `Drop: ${b.drop}`,
    `Time: ${when(b.scheduled_at)}`,
    b.fare != null && `Fare: ₹${b.fare.toLocaleString('en-IN')}`,
    '',
    "We'll send your driver's details once a driver is assigned.",
    track && `Track your booking: ${track}`,
  );
}

export function customerDriverMessage(b: MessageBooking, d: MessageDriver, brand: string, origin: string) {
  const track = trackingLink(origin, b.tracking_token);
  const car = [d.vehicle_model, d.plate_number].filter(Boolean).join(', ');
  return lines(
    `Hello${b.customer_name ? ` ${b.customer_name}` : ''}, your ${brand} driver for booking #${b.id}:`,
    '',
    `Driver: ${d.name ?? '-'}`,
    car && `Car: ${car}`,
    d.phone && `Phone: ${d.phone}`,
    `Pickup: ${b.pickup ?? '-'} at ${when(b.scheduled_at)}`,
    track && `Follow your cab live: ${track}`,
  );
}

export function driverTripMessage(b: MessageBooking, brand: string) {
  const map = b.pickup ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.pickup)}` : null;
  return lines(
    `${brand} trip #${b.id}`,
    '',
    `Customer: ${b.customer_name ?? '-'}${b.customer_phone ? ` (${b.customer_phone})` : ''}`,
    `Pickup: ${b.pickup ?? '-'}`,
    b.drop && `Drop: ${b.drop}`,
    `Time: ${when(b.scheduled_at)}`,
    b.fare != null && `Fare: ₹${b.fare.toLocaleString('en-IN')}`,
    b.notes && `Note: ${b.notes}`,
    map && `Map: ${map}`,
  );
}

// What a customer sends family or friends so they can follow the ride.
export function shareRideMessage(
  trip: { pickup: string | null; drop: string | null },
  driver: { name: string | null; vehicle_model: string | null; plate_number: string | null } | null,
  link: string,
) {
  const car = driver ? [driver.vehicle_model, driver.plate_number].filter(Boolean).join(', ') : '';
  return lines(
    `I'm taking a cab${trip.pickup ? ` from ${trip.pickup}` : ''}${trip.drop ? ` to ${trip.drop}` : ''}.`,
    driver?.name ? `Driver: ${driver.name}${car ? ` (${car})` : ''}` : null,
    `Follow my ride live: ${link}`,
  );
}
