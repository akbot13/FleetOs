import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isTrackingToken } from '@/lib/trackingStorage';

export interface BookingStatusSnapshot {
  id: number;
  status: string | null;
  scheduled_at: string | null;
  pickup: string | null;
  drop: string | null;
  driver: {
    name: string | null;
    phone: string | null;
    vehicle_model: string | null;
    plate_number: string | null;
  } | null;
  driverLocation: { lat: number; lng: number } | null;
  driverLocationAt: string | null;
}

export const POLL_MS = 10_000;

export function isClosedStatus(status: string | null | undefined) {
  return status === 'completed' || status === 'cancelled';
}

// The customer can't read the bookings table, so the booking is read through its private
// tracking token. Polls while the trip is open and stops once it is completed or cancelled.
export function useBookingStatus(token: string | null, options: { poll?: boolean } = {}) {
  const { poll = true } = options;
  const valid = isTrackingToken(token);
  return useQuery({
    queryKey: ['customer-booking-status', token],
    enabled: valid,
    queryFn: async (): Promise<BookingStatusSnapshot | null> => {
      const { data: rows, error } = await supabase.rpc('get_booking_status', { p_token: token! });
      if (error) throw error;
      const booking = rows?.[0];
      if (!booking) return null;

      return {
        id: booking.id,
        status: booking.status,
        scheduled_at: booking.scheduled_at,
        pickup: booking.pickup,
        drop: booking.drop,
        driver: booking.driver_name
          ? {
              name: booking.driver_name,
              phone: booking.driver_phone,
              vehicle_model: booking.vehicle_model,
              plate_number: booking.plate_number,
            }
          : null,
        driverLocation:
          typeof booking.driver_lat === 'number' && typeof booking.driver_lng === 'number'
            ? { lat: booking.driver_lat, lng: booking.driver_lng }
            : null,
        driverLocationAt: booking.driver_location_at,
      };
    },
    refetchInterval: (query) => {
      if (!poll) return false;
      return isClosedStatus(query.state.data?.status) ? false : POLL_MS;
    },
  });
}
