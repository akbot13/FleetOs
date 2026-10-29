import { useEffect, useState } from 'react';
import { CheckCircle, Copy, Loader2, Share2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TripPreviewMap } from '@/components/maps/TripPreviewMap';
import { useToast } from '@/hooks/use-toast';
import { isClosedStatus, useBookingStatus } from '@/hooks/useBookingStatus';
import { clearSavedTrackingToken, trackingLink } from '@/lib/trackingStorage';
import { shareRideMessage } from '@/lib/whatsappMessages';

interface TrackBookingProps {
  token: string;
  // Shown until the booking has been read from the database.
  fallbackPickup?: string;
  fallbackDrop?: string;
  onDone?: () => void;
}

// A location older than this is probably not coming through (phone asleep, no signal).
const STALE_AFTER_MINUTES = 5;

function describeAge(updatedAt: string | null, now: number) {
  if (!updatedAt) return { minutes: null, text: null };
  const minutes = Math.max(0, Math.floor((now - new Date(updatedAt).getTime()) / 60000));
  return { minutes, text: minutes < 1 ? 'just now' : `${minutes} min ago` };
}

export function TrackBooking({ token, fallbackPickup, fallbackDrop, onDone }: TrackBookingProps) {
  const { toast } = useToast();
  const { data: booking, isLoading } = useBookingStatus(token);
  // Re-render every 30 s so "updated 2 min ago" keeps counting between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const closed = isClosedStatus(booking?.status);
  useEffect(() => {
    // A finished trip is no longer offered on the home screen.
    if (closed) clearSavedTrackingToken();
  }, [closed]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingLink(token));
      toast({ title: 'Tracking link copied' });
    } catch {
      toast({ title: 'Could not copy the link', description: trackingLink(token), variant: 'destructive' });
    }
  };

  // The phone's share sheet where there is one (most mobiles); otherwise WhatsApp, where the
  // customer picks who to send it to.
  const shareRide = async () => {
    if (!booking) return;
    const link = trackingLink(token);
    const text = shareRideMessage({ pickup: booking.pickup, drop: booking.drop }, booking.driver, link);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Follow my ride', text });
        return;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="text-center py-12 animate-slide-up">
        <p className="text-sm font-semibold mb-1">We couldn't find this booking</p>
        <p className="text-sm text-muted-foreground mb-6">Check the tracking link and try again.</p>
        {onDone && (
          <Button onClick={onDone} className="w-full h-12 rounded-xl font-semibold max-w-xs mx-auto">
            Back to Home
          </Button>
        )}
      </div>
    );
  }

  const pickup = booking.pickup ?? fallbackPickup ?? '';
  const drop = booking.drop ?? fallbackDrop ?? '';
  const driver = booking.driver;
  const cancelled = booking.status === 'cancelled';
  const age = describeAge(booking.driverLocationAt, now);
  const stale = age.minutes === null || age.minutes >= STALE_AFTER_MINUTES;

  return (
    <div className="text-center py-8 animate-slide-up">
      <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 ${cancelled ? 'bg-destructive/10' : 'bg-success/10'}`}>
        {cancelled
          ? <XCircle className="h-10 w-10 text-destructive" />
          : <CheckCircle className="h-10 w-10 text-success" />}
      </div>
      <h2 className="text-xl font-bold mb-2">
        {cancelled ? 'Booking cancelled' : booking.status === 'completed' ? 'Trip completed' : 'Booking Confirmed!'}
      </h2>
      <p className="text-sm text-muted-foreground mb-1">Booking ID: #{booking.id}</p>
      <p className="text-sm text-muted-foreground mb-1">{pickup} → {drop || 'Tour'}</p>
      {booking.scheduled_at && (
        <p className="text-sm text-muted-foreground mb-6">
          {new Date(booking.scheduled_at).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
          })}
        </p>
      )}

      {!closed && pickup && (
        <div className="max-w-md mx-auto mb-4 text-left">
          <TripPreviewMap
            pickup={pickup}
            drop={drop}
            driverLocation={booking.driverLocation}
            title={booking.driverLocation ? 'Your cab' : 'Your trip'}
            subtitle={booking.driverLocation ? 'Live location, updates every few seconds' : 'Route preview'}
            mapClassName="h-[260px]"
          />
          {driver && booking.driverLocation && (
            <p className={`mt-2 text-xs ${stale ? 'text-warning' : 'text-muted-foreground'}`}>
              {stale
                ? `Driver's location isn't updating${age.text ? ` (last seen ${age.text})` : ''}`
                : `Driver location updated ${age.text}`}
            </p>
          )}
          {driver && !booking.driverLocation && (
            <p className="mt-2 text-xs text-muted-foreground">Waiting for the driver's location</p>
          )}
        </div>
      )}

      <Card className="p-4 shadow-card rounded-xl text-left mb-4 max-w-xs mx-auto">
        <p className="text-xs text-muted-foreground mb-1">Trip status</p>
        {!driver ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">DRV</div>
            <p className="text-sm font-semibold text-muted-foreground">
              {cancelled
                ? 'This booking was cancelled.'
                : 'Finding your driver. Their name, car and phone number will appear here as soon as one is assigned; keep this page open or come back to this link.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-bold text-secondary-foreground">
                DRV
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{driver.name ?? 'Assigned driver'}</p>
                <p className="text-xs text-muted-foreground">
                  {[driver.vehicle_model, driver.plate_number].filter(Boolean).join(' · ') || 'Vehicle details shared'}
                </p>
              </div>
            </div>
            {driver.phone && (
              <p className="text-sm font-medium text-foreground">{driver.phone}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Save this page's link to check on your driver at any time.
            </p>
          </div>
        )}
      </Card>

      <div className="space-y-2 max-w-xs mx-auto">
        {!closed && (
          <Button onClick={shareRide} className="w-full h-11 rounded-xl font-semibold bg-[#25D366] text-white hover:bg-[#1ebe5a]">
            <Share2 className="h-4 w-4 mr-2" />
            Share my ride
          </Button>
        )}
        {!closed && (
          <Button variant="outline" onClick={copyLink} className="w-full h-11 rounded-xl font-semibold">
            <Copy className="h-4 w-4 mr-2" />
            Copy tracking link
          </Button>
        )}
        {onDone && (
          <Button
            onClick={onDone}
            className="w-full h-12 bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-xl font-semibold"
          >
            Back to Home
          </Button>
        )}
      </div>
    </div>
  );
}
