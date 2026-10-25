import { Card } from '@/components/ui/card';
import { SupabaseBooking } from '@/hooks/useSupabaseData';
import type { ScheduledTrip, MockTrip } from './types';

export const JAIPUR_CENTER = { lat: 26.9124, lng: 75.7873 };
export const PICKUP_FALLBACK = { lat: 26.85, lng: 75.85 };
export const DROP_FALLBACK = { lat: 26.95, lng: 75.9 };

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const TRIP_TYPE_ICONS: Record<string, string> = {
  city: '🚗', airport: '✈️', outstation: '🛣️', sightseeing: '🏛️',
};

export const EXPENSE_LABELS: Record<string, string> = {
  fuel_petrol: '⛽ Petrol',
  fuel_cng: '💨 CNG',
  toll: '🛣️ Toll',
  parking: '🅿️ Parking',
  other: '📝 Other',
};

export const documents = [
  { name: 'Driving License', status: 'verified' as const, expiry: '2028-05-15' },
  { name: 'Vehicle RC', status: 'verified' as const, expiry: '2027-11-20' },
  { name: 'Insurance', status: 'expiring' as const, expiry: '2026-04-01' },
  { name: 'Fitness Certificate', status: 'pending' as const, expiry: null },
  { name: 'PAN Card', status: 'verified' as const, expiry: null },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function getHoursUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m away`;
  if (mins > 0) return `${mins} min away`;
  return 'Now';
}

export function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function metersBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function bookingToActiveTrip(booking: SupabaseBooking): MockTrip {
  return {
    id: `BK-${booking.id}`,
    customerName: booking.customer_name ?? 'Customer',
    customerPhone: booking.customer_phone ?? '',
    pickup: booking.pickup ?? '',
    drop: booking.drop ?? '',
    fare: booking.fare ?? 0,
    distance: 'Live route',
    notes: booking.notes ?? undefined,
    tripType: booking.trip_type ?? 'city',
    eta: getHoursUntil(booking.scheduled_at ?? new Date().toISOString()),
  };
}

export function bookingToTrip(b: SupabaseBooking): ScheduledTrip {
  const mappedStatus: ScheduledTrip['status'] =
    b.status === 'in-progress'
      ? 'active'
      : b.status === 'confirmed'
        ? (b.driver_confirmed_at ? 'confirmed' : 'pending_confirm')
        : 'pending_confirm';
  return {
    id: `BK-${b.id}`,
    customerName: b.customer_name ?? 'Customer',
    customerPhone: b.customer_phone ?? '',
    pickup: b.pickup ?? '',
    drop: b.drop ?? '',
    fare: b.fare ?? 0,
    distance: '—',
    scheduledAt: b.scheduled_at ?? new Date().toISOString(),
    notes: b.notes ?? '',
    tripType: (b.trip_type as ScheduledTrip['tripType']) ?? 'city',
    status: mappedStatus,
  };
}

export const trackedBookingStatuses = ['pending', 'confirmed', 'in-progress'] as const;

export function sortTripsBySchedule(trips: ScheduledTrip[]) {
  return [...trips].sort(
    (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
  );
}
