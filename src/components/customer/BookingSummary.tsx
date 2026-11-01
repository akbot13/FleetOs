import { useState } from 'react';
import { ArrowLeft, CalendarDays, Info, Loader2, AlertCircle, Banknote, Smartphone, Car, Phone, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingFormData } from './BookingForm';
import { tripTypeConfig } from './TripTypeSelector';
import { TripPreviewMap } from '@/components/maps/TripPreviewMap';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { vehicleClassLabel } from '@/lib/dispatch';
import { saveTrackingToken } from '@/lib/trackingStorage';
import { bookingRequest, tripEnds } from '@/lib/bookingRequest';
import { saveCustomer } from '@/lib/savedCustomer';
import { FareNote } from './FareEstimate';
import { useFareQuote } from '@/hooks/useFareQuote';
import { telHref, whatsappHref } from '@/lib/contact';
import { confirmLabel, tripDays } from '@/lib/customerTrip';
import { TrackBooking } from './TrackBooking';
import { TripTypeIcon } from '@/components/TripTypeIcon';
import { acceptedPayments, pickPayment, PAYMENT_LABELS, type PaymentMethodId } from '@/lib/fleetDisplay';

interface BookingSummaryProps {
  data: BookingFormData;
  onEdit: () => void;
  onDone: () => void;
}

export function BookingSummary({ data, onEdit, onDone }: BookingSummaryProps) {
  const [chosenPayment, setChosenPayment] = useState<PaymentMethodId | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; detail: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Private token from create_customer_booking; customers can't read the bookings table directly.
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const { org } = useOrg();
  const { fare, isLoading: fareLoading, isError: fareError } = useFareQuote(data);
  const call = telHref(org?.support_phone);
  const whatsapp = whatsappHref(org?.whatsapp_phone);

  // Payment follows what the fleet accepts. One method is shown as a fact, not a choice.
  const acceptedMethods = acceptedPayments(org?.payment_methods);
  const payment = pickPayment(acceptedMethods, chosenPayment);
  const cancellationNote = org?.cancellation_note?.trim() || null;

  const tripInfo = tripTypeConfig.find((t) => t.id === data.tripType);
  const request = bookingRequest(data);
  const ends = tripEnds(data);
  const previewPickup = ends.pickup;
  const previewDrop = ends.drop;
  const previewStops = data.tripType === 'city_tour'
    ? data.stops.filter(stop => stop.trim().length > 0)
    : [];

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!org?.id) {
        throw new Error('Fleet details are still loading. Try again in a moment.');
      }

      const payload = { ...request, payment_method: payment };

      const db = supabase;
      const { data: rows, error } = await db.rpc('create_customer_booking', { p_org_id: org.id, p_booking: payload });
      if (error) throw error;
      const created = rows?.[0];
      if (!created?.booking_id) throw new Error("The booking wasn't saved. Try again.");
      // Keep the token so the live map can be reopened later from this device.
      saveTrackingToken(created.booking_token);
      setTrackingToken(created.booking_token);
      saveCustomer(org.id, data.customerName, data.customerPhone);
    } catch (err) {
      console.error('Booking error:', err);
      setSubmitError({
        title: "Couldn't confirm your booking",
        detail: typeof err?.message === 'string' && err.message ? err.message : 'Check your connection and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (trackingToken !== null) {
    return (
      <TrackBooking
        token={trackingToken}
        fallbackPickup={data.pickup}
        fallbackDrop={data.drop || 'Tour'}
        onDone={onDone}
      />
    );
  }

  const days = data.tripType === 'multiday' ? tripDays(data.date, data.numberOfDays) : [];
  const whenText = data.date && data.time
    ? new Date(`${data.date}T${data.time}`).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : `${data.date} ${data.time}`;
  const PayIcon = payment === 'upi' ? Smartphone : Banknote;

  return (
    <div className="animate-slide-up space-y-3">
      <span className="cu-pill cu-tint inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold">
        <TripTypeIcon type={data.tripType} className="h-4 w-4" />
        {tripInfo?.label}
      </span>

      <div className="grid grid-cols-2 gap-3">
        {/* Route */}
        <div className="cu-card col-span-2 overflow-hidden">
          <TripPreviewMap
            pickup={previewPickup}
            drop={previewDrop}
            stops={previewStops}
            title="Route"
            subtitle="Your trip"
            mapClassName="h-[150px]"
            className="rounded-none border-0 shadow-none"
          />
        </div>

        {/* Fare */}
        <div className="cu-card cu-tint p-5">
          <p className="text-xs">Estimated fare</p>
          <div className="mt-2 min-h-[40px]">
            {fare !== undefined ? (
              <span className="cu-serif text-4xl">{`₹${fare.toLocaleString('en-IN')}`}</span>
            ) : fareError ? (
              <span className="text-sm font-semibold">Fare unavailable</span>
            ) : (
              <span
                className="block h-9 w-24 animate-pulse rounded-md bg-background/60"
                role={fareLoading ? 'status' : undefined}
                aria-label={fareLoading ? 'Loading fare' : undefined}
              />
            )}
          </div>
          <div className="mt-2"><FareNote tripType={data.tripType} /></div>
        </div>

        {/* Pickup time */}
        <div className="cu-card p-5">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
          <p className="mt-3 text-xs text-muted-foreground">{data.tripType === 'airport' ? 'Flight time' : 'Pickup time'}</p>
          <p className="text-sm font-semibold">{whenText}</p>
          {data.tripType === 'airport' && data.flightNumber && (
            <p className="mt-1 text-xs text-muted-foreground">Flight {data.flightNumber}</p>
          )}
          {data.tripType === 'city_tour' && <p className="mt-1 text-xs text-muted-foreground">{data.estimatedHours} hrs</p>}
          {data.tripType === 'intercity' && data.isRoundTrip && data.returnDate && (
            <p className="mt-1 text-xs text-muted-foreground">Return: {data.returnDate}</p>
          )}
        </div>

        {/* Car size */}
        <div className="cu-card col-span-2 flex items-center gap-3 p-5">
          <Car className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="text-xs text-muted-foreground">Car size</p>
            <p className="text-sm font-semibold">{vehicleClassLabel[data.vehicleClass]}</p>
          </div>
        </div>

        {/* Payment */}
        <div className={cn('cu-card p-5', acceptedMethods.length > 1 ? 'col-span-2' : '')}>
          {acceptedMethods.length === 1 ? (
            <>
              <PayIcon className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-3 text-xs text-muted-foreground">Payment</p>
              <p className="text-sm font-semibold">Pay {PAYMENT_LABELS[payment]} to your driver</p>
            </>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Payment method</p>
              <div className="flex gap-2">
                {acceptedMethods.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={payment === id}
                    onClick={() => setChosenPayment(id)}
                    className={cn(
                      'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-colors',
                      payment === id ? 'cu-tint border-primary' : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {id === 'upi' ? <Smartphone className="h-4 w-4" aria-hidden /> : <Banknote className="h-4 w-4" aria-hidden />}
                    {PAYMENT_LABELS[id]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Multi-day plan */}
        {data.tripType === 'multiday' && days.length > 0 && (
          <div className="cu-card col-span-2 p-5">
            <p className="cu-serif text-xl">{data.numberOfDays} {data.numberOfDays === 1 ? 'day' : 'days'}</p>
            <ul className="mt-3 space-y-2">
              {days.map(day => (
                <li key={day.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{day.label}</span>
                  <span className="text-muted-foreground">{day.date}</span>
                </li>
              ))}
            </ul>
            {data.driverStayRequired && <p className="mt-3 text-xs text-muted-foreground">Driver stay required</p>}
          </div>
        )}
      </div>

      {cancellationNote && (
        <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{cancellationNote}</span>
        </p>
      )}

      {(call || whatsapp) && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-semibold">Need help?</p>
          <div className="flex gap-3">
            {call && (
              <a href={call} aria-label="Call us" className="cu-icon-btn bg-primary text-primary-foreground">
                <Phone className="h-5 w-5" aria-hidden />
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp us" className="cu-icon-btn cu-tint">
                <MessageCircle className="h-5 w-5" aria-hidden />
              </a>
            )}
          </div>
        </div>
      )}

      {submitError && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-destructive">{submitError.title}</p>
            {submitError.detail && <p className="text-muted-foreground">{submitError.detail}</p>}
          </div>
        </div>
      )}

      {/* Sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-[hsl(var(--cu-page))] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-6 py-3">
          <button
            type="button"
            aria-label="Edit booking"
            onClick={onEdit}
            disabled={submitting}
            className="cu-icon-btn cu-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="h-12 flex-1 rounded-full text-base font-semibold"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming</>
              : submitError ? 'Try again' : confirmLabel(fare)}
          </Button>
        </div>
      </div>
    </div>
  );
}
