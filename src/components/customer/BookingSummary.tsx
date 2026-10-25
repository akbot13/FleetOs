import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, CalendarDays, Clock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BookingFormData } from './BookingForm';
import { tripTypeConfig } from './TripTypeSelector';
import { TripPreviewMap } from '@/components/maps/TripPreviewMap';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOrg } from '@/hooks/useOrg';

interface BookingSummaryProps {
  data: BookingFormData;
  onEdit: () => void;
  onDone: () => void;
}

type PaymentMethod = 'cash' | 'upi' | 'card';

interface AssignedDriverSnapshot {
  name: string | null;
  phone: string | null;
  vehicle_model: string | null;
  plate_number: string | null;
}

interface BookingStatusSnapshot {
  id: number;
  status: string | null;
  scheduled_at: string | null;
  pickup: string | null;
  drop: string | null;
  driver: AssignedDriverSnapshot | null;
}

const fareEstimates: Record<string, number> = {
  local: 180,
  airport: 450,
  city_tour: 2200,
  intercity: 3200,
  multiday: 5500,
};

const tripTypeToDb: Record<string, string> = {
  local: 'city',
  city_tour: 'sightseeing',
  intercity: 'outstation',
  multiday: 'outstation',
  airport: 'airport',
};

export function BookingSummary({ data, onEdit, onDone }: BookingSummaryProps) {
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);
  // Private token from create_customer_booking; customers can't read the bookings table directly.
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const { toast } = useToast();
  const { org } = useOrg();

  const { data: liveBooking } = useQuery({
    queryKey: ['customer-booking-status', trackingToken],
    enabled: trackingToken !== null,
    queryFn: async () => {
      if (trackingToken === null) return null;

      const db = supabase;
      const { data: rows, error } = await db.rpc('get_booking_status', { p_token: trackingToken });
      if (error) throw error;
      const booking = rows?.[0];
      if (!booking) return null;

      const driver: AssignedDriverSnapshot | null = booking.driver_name
        ? {
            name: booking.driver_name,
            phone: booking.driver_phone,
            vehicle_model: booking.vehicle_model,
            plate_number: booking.plate_number,
          } as AssignedDriverSnapshot
        : null;

      return {
        id: booking.id,
        status: booking.status,
        scheduled_at: booking.scheduled_at,
        pickup: booking.pickup,
        drop: booking.drop,
        driver,
      } as BookingStatusSnapshot;
    },
    refetchInterval: (query) => {
      const snapshot = query.state.data as BookingStatusSnapshot | null | undefined;
      return snapshot?.driver ? false : 15000;
    },
  });

  const tripInfo = tripTypeConfig.find((t) => t.id === data.tripType);
  const fare = fareEstimates[data.tripType] ?? 0;
  const airportTerminal = `${data.hubCity || 'City'} Airport`;
  const previewPickup = data.tripType === 'airport' && data.airportDirection === 'arriving'
    ? airportTerminal
    : data.pickup;
  const previewDrop = data.tripType === 'airport'
    ? data.airportDirection === 'arriving'
      ? data.pickup
      : airportTerminal
    : data.drop;
  const previewStops = data.tripType === 'city_tour'
    ? data.stops.filter(stop => stop.trim().length > 0)
    : [];

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (!org?.id) {
        throw new Error('Organisation not loaded yet. Refresh and try again.');
      }

      const scheduledAt = data.date && data.time
        ? new Date(`${data.date}T${data.time}`).toISOString()
        : new Date().toISOString();

      const payload = {
        customer_name: data.customerName || null,
        customer_phone: data.customerPhone
          ? '+91' + data.customerPhone.replace(/\D/g, '').slice(-10)
          : null,
        pickup: data.pickup,
        drop: data.tripType === 'city_tour' ? (data.stops[0] || null) : data.drop,
        scheduled_at: scheduledAt,
        trip_type: tripTypeToDb[data.tripType] ?? data.tripType,
        fare,
        payment_method: payment,
        notes: data.notes?.trim() || null,
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

      const db = supabase;
      const { data: rows, error } = await db.rpc('create_customer_booking', { p_org_id: org.id, p_booking: payload });
      if (error) throw error;
      const created = rows?.[0];
      if (!created?.booking_id) throw new Error('The booking was not saved. Please try again.');
      setBookingId(created.booking_id);
      setTrackingToken(created.booking_token);
    } catch (err: any) {
      console.error('Booking error:', err);
      toast({ title: 'Booking failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (bookingId !== null) {
    const assignedDriver = liveBooking?.driver ?? null;
    const liveDrop = liveBooking?.drop ?? data.drop ?? 'Tour';
    const routeLabel = liveBooking
      ? `${liveBooking.pickup ?? data.pickup} -> ${liveDrop}`
      : `${data.pickup} -> ${data.drop || 'Tour'}`;

    return (
      <div className="text-center py-12 animate-slide-up">
        <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-10 w-10 text-success" />
        </div>
        <h2 className="text-xl font-bold mb-2">Booking Confirmed!</h2>
        <p className="text-sm text-muted-foreground mb-1">Booking ID: #{bookingId}</p>
        <p className="text-sm text-muted-foreground mb-1">
          {tripInfo?.emoji} {tripInfo?.label}: {routeLabel}
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {data.date} at {data.time}
        </p>

        <Card className="p-4 shadow-card rounded-xl text-left mb-4 max-w-xs mx-auto">
          <p className="text-xs text-muted-foreground mb-1">Trip status</p>
          {!assignedDriver ? (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">DRV</div>
              <p className="text-sm font-semibold text-muted-foreground">
                Your driver and trip details will be shared with you on SMS and WhatsApp once the assignment is confirmed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-bold text-secondary-foreground">
                  DRV
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{assignedDriver.name ?? 'Assigned driver'}</p>
                  <p className="text-xs text-muted-foreground">
                    {[assignedDriver.vehicle_model, assignedDriver.plate_number].filter(Boolean).join(' · ') || 'Vehicle details shared'}
                  </p>
                </div>
              </div>
              {assignedDriver.phone && (
                <p className="text-sm font-medium text-foreground">{assignedDriver.phone}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Driver and trip details have been queued for SMS and WhatsApp delivery.
              </p>
            </div>
          )}
        </Card>

        <Button
          onClick={onDone}
          className="w-full h-12 bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-xl font-semibold max-w-xs mx-auto"
        >
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 bg-secondary/10 text-secondary-foreground text-xs font-bold rounded-full border border-secondary">
          {tripInfo?.emoji} {tripInfo?.label}
        </span>
      </div>

      <TripPreviewMap
        pickup={previewPickup}
        drop={previewDrop}
        stops={previewStops}
        title="Trip preview"
        subtitle="Review the route before you confirm the booking"
        mapClassName="h-[260px]"
      />

      <Card className="p-5 shadow-elevated rounded-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-success" />
            <div className="w-px h-8 bg-border" />
            <MapPin className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Pickup</p>
              <p className="text-sm font-semibold">{data.pickup}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {data.tripType === 'city_tour' ? 'Stops' : 'Drop'}
              </p>
              {data.tripType === 'city_tour' && data.stops.length > 0 ? (
                <ul className="space-y-1">
                  {data.stops.map((stop, index) => (
                    <li key={index} className="text-sm font-semibold">{index + 1}. {stop}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-semibold">{data.drop || '-'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t pt-3">
          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{data.date}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{data.time}</span>
          {data.tripType === 'city_tour' && (
            <span>{data.estimatedHours} hrs</span>
          )}
          {data.tripType === 'intercity' && data.isRoundTrip && (
            <span>Return: {data.returnDate}</span>
          )}
          {data.tripType === 'multiday' && (
            <>
              <span>{data.numberOfDays} days</span>
              {data.driverStayRequired && <span>Driver stay required</span>}
            </>
          )}
          {data.tripType === 'airport' && data.flightNumber && (
            <span>Flight {data.flightNumber}</span>
          )}
        </div>
      </Card>

      <Card className="p-5 shadow-elevated rounded-xl">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">Estimated Fare</span>
          <span className="text-2xl font-bold">₹{fare.toLocaleString()}</span>
        </div>
        <p className="text-xs text-muted-foreground">Final fare may vary based on route and stops</p>
      </Card>

      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Payment method</p>
        <div className="flex gap-2">
          {([
            { id: 'cash' as PaymentMethod, label: 'Cash' },
            { id: 'upi' as PaymentMethod, label: 'UPI' },
            { id: 'card' as PaymentMethod, label: 'Card' },
          ]).map((paymentMethod) => (
            <button
              key={paymentMethod.id}
              onClick={() => setPayment(paymentMethod.id)}
              className={cn(
                'flex-1 py-2.5 rounded-lg text-xs font-semibold border transition',
                payment === paymentMethod.id
                  ? 'bg-secondary text-secondary-foreground border-secondary'
                  : 'bg-card text-muted-foreground border-border'
              )}
            >
              {paymentMethod.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onEdit} className="flex-1 h-12 rounded-xl font-semibold">
          Back to edit
        </Button>
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="flex-1 h-12 kinetic-gradient text-white rounded-xl font-bold font-display disabled:opacity-60 transition-opacity hover:opacity-90"
        >
          {submitting ? 'Saving...' : 'Confirm Booking'}
        </button>
      </div>
    </div>
  );
}
