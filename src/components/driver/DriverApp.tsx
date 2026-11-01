import { useState, useEffect, useRef } from 'react';
import { Car, Navigation, Phone, Clock, Camera, FileText, CheckCircle, X, Power, AlertTriangle, Wallet, Fuel, WifiOff, PhoneCall, Calendar, AlarmClock, Shield, Banknote, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useMyDriverProfile, useTodayHandover, SupabaseBooking, SupabaseDriver } from '@/hooks/useSupabaseData';
import { useOrg } from '@/hooks/useOrg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDriverCash } from './useDriverCash';
import { queueFeedbackMessage, queueInvoiceMessage } from '@/lib/customerAutomation';
import { toast } from 'sonner';
import type { DriverScreen, TripPhase, ScheduledTrip, MockTrip } from './types';
import { tripTypeName, documents, formatTime, formatDate, getHoursUntil, formatCurrency, metersBetween, bookingToActiveTrip, bookingToTrip, trackedBookingStatuses, sortTripsBySchedule } from './helpers';
import { TripAlarm } from './TripAlarm';
import { ContactActions } from './ContactActions';
import { ExpenseTracker } from './ExpenseTracker';
import { ScheduledTripCard } from './ScheduledTripCard';
import { DriverTripMap } from './DriverTripMap';
import { FleetNote } from './FleetNote';
import { FleetMark } from '@/components/FleetMark';
import { TripTypeIcon } from '@/components/TripTypeIcon';
import { useOrgDriverInfo } from '@/hooks/useOrgDriverInfo';
import { telHref } from '@/lib/contact';
import { acceptedPayments, firstName, greetingForHour, pickPayment, PAYMENT_LABELS } from '@/lib/fleetDisplay';

interface DriverAppProps { driver?: (Pick<SupabaseDriver,'id'|'name'|'status'> & Partial<SupabaseDriver>) | null }

export function DriverApp({ driver }: DriverAppProps) {
  const [screen, setScreen] = useState<DriverScreen>('home');
  const [activeTrip, setActiveTrip] = useState<MockTrip | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [tripPhase, setTripPhase] = useState<TripPhase>('navigating');
  const [alarmTrip, setAlarmTrip] = useState<ScheduledTrip | null>(null);
  const [scheduledTrips, setScheduledTrips] = useState<ScheduledTrip[]>([]);
  const [collectBookingId, setCollectBookingId] = useState<number | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi'>('cash');
  const [collectLoading, setCollectLoading] = useState(false);
  const [tripSaving, setTripSaving] = useState(false);
  const [showUpiDetails, setShowUpiDetails] = useState(false);
  const [bannerTrips, setBannerTrips] = useState<string[]>([]);
  const [alarmTrips, setAlarmTrips] = useState<string[]>([]);
  const [detailTrip, setDetailTrip] = useState<ScheduledTrip | null>(null);
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number; updatedAt: string } | null>(null);
  const lastPublishedLocationRef = useRef<{ lat: number; lng: number; publishedAt: number } | null>(null);
  const lastSyncedStatusRef = useRef<string | null>(null);

  const { data: fetchedProfile } = useMyDriverProfile();
  const myProfile = driver ?? fetchedProfile;
  const { data: todayHandover, refetch: refetchTodayHandover } = useTodayHandover(myProfile?.id);
  const queryClient = useQueryClient();
  const { org } = useOrg();
  const { data: driverInfo } = useOrgDriverInfo();
  const { expenses, collections, addExpense, addCollection, deleteExpense, handleHandOver, handoverLoading, pendingSyncCount } =
    useDriverCash(myProfile?.id, org?.id, refetchTodayHandover);

  const { data: realTrips = [] } = useQuery({
    queryKey: ['driver-trips', myProfile?.id, org?.id],
    queryFn: async () => {
      if (!myProfile?.id || !org?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('org_id', org.id)
        .eq('driver_id', myProfile.id)
        .in('status', [...trackedBookingStatuses])
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return data as SupabaseBooking[];
    },
    enabled: !!myProfile?.id && !!org?.id,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  // Only the methods the fleet accepts are offered when logging a payment.
  const acceptedMethods = acceptedPayments(org?.payment_methods);
  const officeCall = telHref(driverInfo?.office_phone);
  const brandName = org?.brand_name?.trim() || null;

  const queryTrips = realTrips.map(bookingToTrip);
  const displayTrips: ScheduledTrip[] = [
    ...queryTrips,
    ...scheduledTrips.filter(localTrip => !queryTrips.some(queryTrip => queryTrip.id === localTrip.id)),
  ];
  const sortedTrips = sortTripsBySchedule(displayTrips);
  const activeBooking = realTrips.find(trip => trip.status === 'in-progress') ?? null;
  const readyBooking = realTrips.find(
    trip => trip.status === 'confirmed' && Boolean(trip.driver_confirmed_at)
  ) ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString();
  const monthKey = todayKey.slice(0, 7);
  const todayRevenue = realTrips
    .filter(trip => trip.payment_confirmed_at?.startsWith(todayKey))
    .reduce((sum, trip) => sum + (trip.amount_collected ?? trip.fare ?? 0), 0);
  const weekRevenue = realTrips
    .filter(trip => trip.payment_confirmed_at && trip.payment_confirmed_at >= weekStartIso)
    .reduce((sum, trip) => sum + (trip.amount_collected ?? trip.fare ?? 0), 0);
  const monthRevenue = realTrips
    .filter(trip => trip.payment_confirmed_at?.startsWith(monthKey))
    .reduce((sum, trip) => sum + (trip.amount_collected ?? trip.fare ?? 0), 0);
  const completedTodayCount = realTrips.filter(trip => trip.trip_completed_at?.startsWith(todayKey)).length;
  const completedWeekCount = realTrips.filter(trip => trip.trip_completed_at && trip.trip_completed_at >= weekStartIso).length;
  const completedMonthCount = realTrips.filter(trip => trip.trip_completed_at?.startsWith(monthKey)).length;
  const acceptanceRate = realTrips.length > 0
    ? Math.round((realTrips.filter(trip => Boolean(trip.driver_confirmed_at)).length / realTrips.length) * 100)
    : 100;
  const gpsStatusLabel = !isOnline
    ? 'Offline'
    : driverPosition
      ? `GPS updated ${formatTime(driverPosition.updatedAt)}`
      : 'Waiting for GPS';

  const checkReminders = () => {
    const now = Date.now();
    const sixHr = 6 * 60 * 60 * 1000;
    const oneHr = 60 * 60 * 1000;
    sortedTrips.forEach(trip => {
      if (trip.status !== 'pending_confirm' && trip.status !== 'confirmed') return;
      const tripTime = new Date(trip.scheduledAt).getTime();
      const msUntil = tripTime - now;
      if (msUntil <= 0) return;
      if (msUntil <= sixHr) {
        const dismissed = localStorage.getItem('dismissed_6hr_' + trip.id);
        if (!dismissed) setBannerTrips(prev => prev.includes(trip.id) ? prev : [...prev, trip.id]);
      }
      if (msUntil <= oneHr) {
        const dismissed = localStorage.getItem('dismissed_1hr_' + trip.id);
        if (!dismissed) setAlarmTrips(prev => prev.includes(trip.id) ? prev : [...prev, trip.id]);
      }
    });
  };

  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [sortedTrips]);

  useEffect(() => {
    if (!myProfile?.id || !org?.id) return;
    const channel = supabase
      .channel('driver-trips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `org_id=eq.${org.id}` },
        (payload) => {
          const nextBooking = payload.eventType === 'DELETE' ? null : payload.new as SupabaseBooking;
          const previousBooking = (payload.old ?? {}) as Partial<SupabaseBooking>;
          const nextDriverId = nextBooking?.driver_id ?? null;
          const previousDriverId = previousBooking.driver_id ?? null;
          const touchesCurrentDriver = nextDriverId === myProfile.id || previousDriverId === myProfile.id;

          if (!touchesCurrentDriver) {
            return;
          }

          if (payload.eventType === 'DELETE') {
            const deletedBooking = payload.old as { id?: number };
            if (deletedBooking?.id != null) {
              setScheduledTrips(prev => prev.filter(trip => trip.id !== `BK-${deletedBooking.id}`));
            }
            return;
          }

          const booking = nextBooking as SupabaseBooking;
          const shouldTrackBooking = booking.driver_id === myProfile.id
            && trackedBookingStatuses.includes(booking.status as (typeof trackedBookingStatuses)[number]);

          if (!shouldTrackBooking) {
            setScheduledTrips(prev => prev.filter(trip => trip.id !== `BK-${booking.id}`));
            queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org.id] });
            return;
          }

          if (shouldTrackBooking) {
            const newTrip = bookingToTrip(booking);
            setScheduledTrips(prev => {
              const others = prev.filter(trip => trip.id !== newTrip.id);
              return sortTripsBySchedule([newTrip, ...others]);
            });

            if (booking.status === 'confirmed' && !booking.driver_confirmed_at) {
              setAlarmTrip(newTrip);
            }
          }

          queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org.id] });
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myProfile?.id, org?.id, queryClient]);

  useEffect(() => {
    if (activeBooking) {
      const nextTrip = bookingToActiveTrip(activeBooking);
      setActiveTrip(prev =>
        prev?.id === nextTrip.id &&
        prev.pickup === nextTrip.pickup &&
        prev.drop === nextTrip.drop &&
        prev.fare === nextTrip.fare &&
        prev.notes === nextTrip.notes
          ? prev
          : nextTrip
      );
      setTripPhase('started');
      return;
    }

    if (!activeTrip && readyBooking) {
      setActiveTrip(bookingToActiveTrip(readyBooking));
      setTripPhase('navigating');
    }
  }, [activeBooking, activeTrip, readyBooking]);

  useEffect(() => {
    if (!myProfile?.id) return;

    const desiredStatus = !isOnline
      ? 'offline'
      : activeBooking
        ? 'on-trip'
        : 'free';

    if (lastSyncedStatusRef.current === desiredStatus) return;
    lastSyncedStatusRef.current = desiredStatus;

    void supabase
      .from('drivers')
      .update({ status: desiredStatus })
      .eq('id', myProfile.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['drivers'] });
      });
  }, [activeBooking, isOnline, myProfile?.id, queryClient]);

  useEffect(() => {
    if (!myProfile?.id || !isOnline || !navigator.geolocation) return;

    const publishLocation = async (lat: number, lng: number) => {
      setDriverPosition({ lat, lng, updatedAt: new Date().toISOString() });

      const lastPublished = lastPublishedLocationRef.current;
      const movedEnough = !lastPublished
        || metersBetween(lastPublished, { lat, lng }) >= 30;
      const waitedEnough = !lastPublished
        || Date.now() - lastPublished.publishedAt >= 20000;

      if (!movedEnough && !waitedEnough) return;

      lastPublishedLocationRef.current = { lat, lng, publishedAt: Date.now() };
      await supabase
        .from('drivers')
        .update({
          location_lat: lat,
          location_lng: lng,
        })
        .eq('id', myProfile.id);

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    };

    const watchId = navigator.geolocation.watchPosition(
      position => {
        void publishLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        // Keep the last known location and let the driver continue working.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, myProfile?.id, queryClient]);

  useEffect(() => {
    if (!isOnline) {
      setDriverPosition(null);
    }
  }, [isOnline]);

  const handleConfirmFromAlarm = () => {
    if (!alarmTrip) return;
    setScheduledTrips(trips => trips.map(t => t.id === alarmTrip.id ? { ...t, status: 'confirmed' } : t));
    const bookingId = parseInt(alarmTrip.id.replace('BK-', ''), 10);
    if (!isNaN(bookingId)) handleConfirm(bookingId);
    setAlarmTrip(null);
  };

  const handleConfirmTrip = (id: string) => {
    setScheduledTrips(trips => trips.map(t => t.id === id ? { ...t, status: 'confirmed' } : t));
    const bookingId = parseInt(id.replace('BK-', ''), 10);
    if (!isNaN(bookingId)) handleConfirm(bookingId);
  };

  const refreshTrips = () => {
    queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile?.id, org?.id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  // Trip changes only count once the database has them: on a failed save the screen stays
  // where it was, so the driver never sees "started" or "completed" for a trip the office doesn't.
  const reportSaveError = (what: string, message: string) => {
    toast.error(`Couldn't ${what}. ${message}. Check your connection and try again.`);
  };

  const handleConfirm = async (bookingId: number) => {
    if (!myProfile?.id) return;
    const { error } = await supabase.from('bookings').update({ status: 'confirmed', driver_confirmed_at: new Date().toISOString() }).eq('id', bookingId);
    if (error) {
      setScheduledTrips(trips => trips.map(t => t.id === `BK-${bookingId}` ? { ...t, status: 'pending_confirm' } : t));
      reportSaveError('confirm the trip', error.message);
    }
    refreshTrips();
  };

  const handleStart = async (bookingId: number): Promise<boolean> => {
    if (!myProfile?.id) return false;
    const { error } = await supabase.from('bookings').update({ status: 'in-progress', trip_started_at: new Date().toISOString() }).eq('id', bookingId);
    if (error) {
      reportSaveError('start the trip', error.message);
      return false;
    }
    setScheduledTrips(trips => sortTripsBySchedule(
      trips.map(trip => trip.id === `BK-${bookingId}` ? { ...trip, status: 'active' } : trip)
    ));
    // The duty status also follows the active trip through the status sync above, so a miss here heals itself.
    await supabase.from('drivers').update({ status: 'on-trip' }).eq('id', myProfile.id);
    refreshTrips();
    return true;
  };

  const handleComplete = async (bookingId: number): Promise<boolean> => {
    if (!myProfile?.id) return false;
    const { error } = await supabase.from('bookings').update({ status: 'completed', trip_completed_at: new Date().toISOString() }).eq('id', bookingId);
    if (error) {
      reportSaveError('end the trip', error.message);
      return false;
    }
    setScheduledTrips(trips => trips.filter(trip => trip.id !== `BK-${bookingId}`));
    setBannerTrips(trips => trips.filter(tripId => tripId !== `BK-${bookingId}`));
    setAlarmTrips(trips => trips.filter(tripId => tripId !== `BK-${bookingId}`));
    await supabase.from('drivers').update({ status: 'free' }).eq('id', myProfile.id);
    refreshTrips();
    const completedTrip = realTrips.find(t => t.id === bookingId);
    if (completedTrip) {
      await queueFeedbackMessage(completedTrip, org);
    }
    setCollectBookingId(bookingId);
    setCollectAmount(String(completedTrip?.fare ?? ''));
    setCollectMethod(pickPayment(acceptedMethods, completedTrip?.payment_method));
    return true;
  };

  const handleOdometerPhoto = async (kind: 'start' | 'end', file: File | undefined) => {
    if (!file || !myProfile?.id) return;
    const label = kind === 'start' ? 'start' : 'end';
    const fileName = `odometer_${kind}_${myProfile.id}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('odometer-photos')
      .upload(fileName, file, { upsert: true });
    if (uploadError) {
      reportSaveError(`upload the ${label} odometer photo`, uploadError.message);
      return;
    }
    const { data: urlData } = supabase.storage.from('odometer-photos').getPublicUrl(fileName);
    const { error } = await supabase
      .from('drivers')
      .update(kind === 'start' ? { odometer_start_photo: urlData.publicUrl } : { odometer_end_photo: urlData.publicUrl })
      .eq('id', myProfile.id);
    if (error) {
      reportSaveError(`save the ${label} odometer photo`, error.message);
      return;
    }
    toast(`${kind === 'start' ? 'Start' : 'End'} odometer photo saved`);
  };

  const handleLogPayment = async () => {
    if (!collectBookingId) return;
    const paidAmount = Number(collectAmount);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      toast.error('Enter the amount collected, in rupees.');
      return;
    }
    setCollectLoading(true);
    const { error } = await supabase.from('bookings').update({
      amount_collected: paidAmount,
      payment_method: collectMethod,
      payment_confirmed_at: new Date().toISOString(),
    }).eq('id', collectBookingId);
    if (error) {
      // Keep the payment form open with what was typed, so the driver can retry.
      setCollectLoading(false);
      reportSaveError('save the payment', error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile?.id, org?.id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    const paidTrip = realTrips.find(t => t.id === collectBookingId);
    if (paidTrip) {
      await queueInvoiceMessage(paidTrip, paidAmount, collectMethod, org);
    }
    addCollection({
      tripId: `BK-${collectBookingId}`,
      customerName: paidTrip?.customer_name ?? '',
      amount: paidAmount,
      method: collectMethod,
    });
    setCollectBookingId(null);
    setCollectAmount('');
    setShowUpiDetails(false);
    setActiveTrip(null);
    setScreen('home');
    setTripPhase('navigating');
    setCollectLoading(false);
  };

  const unconfirmedTrips = sortedTrips.filter(t => t.status === 'pending_confirm').length;


  const driverFirstName = firstName(myProfile?.name);
  const greeting = `${greetingForHour(new Date().getHours())}${driverFirstName ? `, ${driverFirstName}` : ''}`;

  return (
    <div className="relative min-h-screen bg-gray-950 text-white">

      {/* 6-hour banner reminders */}
      {bannerTrips.map(tripId => {
        const trip = sortedTrips.find(t => t.id === tripId);
        if (!trip) return null;
        return (
          <div key={tripId} className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-700">Trip reminder</p>
              <p className="text-xs text-blue-600">{trip.customerName} · {new Date(trip.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs text-blue-600">{trip.pickup} → {trip.drop}</p>
            </div>
            <button onClick={() => { localStorage.setItem('dismissed_6hr_' + tripId, 'true'); setBannerTrips(prev => prev.filter(id => id !== tripId)); }} className="text-blue-400 hover:text-blue-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {/* 1-hour alarm overlays */}
      {alarmTrips.map(tripId => {
        const trip = sortedTrips.find(t => t.id === tripId);
        if (!trip) return null;
        return (
          <div key={tripId} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="bg-card rounded-xl p-6 mx-4 max-w-sm w-full text-center">
              <AlarmClock className="h-16 w-16 text-destructive mx-auto mb-4 animate-bounce" />
              <h2 className="text-xl font-semibold text-destructive mb-1">Trip in 1 hour</h2>
              <p className="font-semibold mb-1">{trip.customerName}</p>
              <p className="text-sm text-muted-foreground mb-1">{trip.pickup} → {trip.drop}</p>
              <p className="text-lg font-bold mb-6">₹{trip.fare.toLocaleString('en-IN')}</p>
              <Button className="w-full h-12 rounded-xl" onClick={() => { localStorage.setItem('dismissed_1hr_' + tripId, 'true'); setAlarmTrips(prev => prev.filter(id => id !== tripId)); }}>
                Got it, I'm ready
              </Button>
            </div>
          </div>
        );
      })}

      {/* Cash collection modal */}
      {collectBookingId !== null && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="bg-card rounded-xl p-6 mx-4 max-w-sm w-full">
            <h2 className="text-lg font-semibold mb-1">Log payment collected</h2>
            <p className="text-sm text-muted-foreground mb-4">Fare was ₹{realTrips.find(t => t.id === collectBookingId)?.fare?.toLocaleString('en-IN') ?? collectAmount}</p>
            <input type="number" className="w-full h-12 border border-border rounded-xl px-4 text-base mb-4 bg-background focus:outline-none focus:ring-2 focus:ring-ring" value={collectAmount} onChange={e => setCollectAmount(e.target.value)} placeholder="Amount collected" />
            {acceptedMethods.length > 1 ? (
              <div className="flex gap-2 mb-5">
                {acceptedMethods.map(m => (
                  <button key={m} onClick={() => setCollectMethod(m)} aria-pressed={collectMethod === m} className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border transition-all ${collectMethod === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'}`}>
                    {m === 'upi' ? <Smartphone className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
                {collectMethod === 'upi' ? <Smartphone className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                {PAYMENT_LABELS[collectMethod]} only
              </p>
            )}
            {collectMethod === 'upi' && (
              <div className="mb-4 space-y-2">
                {(org?.upi_id || org?.upi_qr_url) ? (
                  <button
                    onClick={() => setShowUpiDetails(true)}
                    className="w-full min-h-[44px] rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-sm font-semibold"
                  >
                    Show UPI QR / ID
                  </button>
                ) : (
                  <p className="text-xs text-amber-800 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    No UPI details are set up yet. Ask your office.
                  </p>
                )}
              </div>
            )}
            <Button className="w-full h-12 rounded-xl" disabled={collectLoading || !collectAmount} onClick={handleLogPayment}>
              {collectLoading ? 'Saving' : 'Log payment'}
            </Button>
          </div>
        </div>
      )}

      {showUpiDetails && collectMethod === 'upi' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="bg-card rounded-xl p-6 mx-4 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{brandName ? `${brandName} UPI` : 'UPI'}</h2>
              <button onClick={() => setShowUpiDetails(false)} aria-label="Close" className="-mr-2 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            {org?.upi_qr_url && (
              <img src={org.upi_qr_url} alt="UPI QR" className="mx-auto h-56 w-56 rounded-xl border border-border bg-white object-contain p-3" />
            )}
            {org?.upi_id && (
              <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">UPI ID</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{org.upi_id}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(org.upi_id ?? '')}
                    className="min-h-[44px] px-2 text-xs font-semibold text-primary"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Show this to the customer to scan or enter the UPI ID.
            </p>
          </div>
        </div>
      )}

      {/* ── Trip Detail Sheet (BUG-05) ── */}
      {detailTrip && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setDetailTrip(null)}
        >
          <div
            className="bg-gray-900 rounded-t-xl w-full max-w-lg p-6 pb-10 space-y-4"
            style={{ maxHeight: '85vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider mb-1"><TripTypeIcon type={detailTrip.tripType} />{tripTypeName(detailTrip.tripType)}</div>
                <div className="text-lg font-black text-white">{detailTrip.customerName}</div>
              </div>
              <button onClick={() => setDetailTrip(null)} aria-label="Close" className="h-11 w-11 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-gray-600 active:scale-95 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4 bg-gray-800 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Pickup</div><div className="text-sm font-semibold text-white">{detailTrip.pickup}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Drop</div><div className="text-sm font-semibold text-white">{detailTrip.drop}</div></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-gray-800 rounded-xl">
                <div className="text-lg font-black text-white">₹{detailTrip.fare.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Fare</div>
              </div>
              <div className="text-center p-3 bg-gray-800 rounded-xl">
                <div className="text-sm font-black text-white">{formatTime(detailTrip.scheduledAt)}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Pickup time</div>
              </div>
              <div className="text-center p-3 bg-gray-800 rounded-xl">
                <div className="text-sm font-black text-orange-400">{getHoursUntil(detailTrip.scheduledAt)}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">ETA</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400 px-1">
              <AlarmClock className="h-4 w-4" />
              <span>{formatDate(detailTrip.scheduledAt)} · {formatTime(detailTrip.scheduledAt)}</span>
            </div>
            {detailTrip.customerPhone && (
              <div className="flex gap-3">
                <a
                  href={telHref(detailTrip.customerPhone) ?? undefined}
                  className="flex-1 min-h-[48px] rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PhoneCall className="h-4 w-4" /> Call
                </a>
                <a
                  href={`https://wa.me/${detailTrip.customerPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[48px] rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="h-4 w-4" /> WhatsApp
                </a>
              </div>
            )}
            {detailTrip.notes && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-1">Instructions</p>
                <p className="text-sm text-blue-100">{detailTrip.notes}</p>
              </div>
            )}
            <div className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold ${detailTrip.status === 'confirmed' ? 'bg-green-500/10 border border-green-500/20 text-green-300' : 'bg-orange-500/10 border border-orange-500/20 text-orange-300'}`}>
              {detailTrip.status === 'confirmed' ? <><CheckCircle className="h-4 w-4" /> Confirmed</> : <><Clock className="h-4 w-4" /> Awaiting Confirmation</>}
            </div>
            {detailTrip.status === 'confirmed' && (
              <button
                onClick={() => {
                  setActiveTrip({
                    id: detailTrip.id,
                    customerName: detailTrip.customerName,
                    customerPhone: detailTrip.customerPhone,
                    pickup: detailTrip.pickup,
                    drop: detailTrip.drop,
                    fare: detailTrip.fare,
                    distance: detailTrip.distance,
                    notes: detailTrip.notes,
                    tripType: detailTrip.tripType,
                    eta: getHoursUntil(detailTrip.scheduledAt),
                  });
                  setTripPhase('navigating');
                  setScreen('active-trip');
                  setDetailTrip(null);
                }}
                className="w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <Navigation className="h-4 w-4" />
                Start trip
              </button>
            )}
            <button onClick={() => setDetailTrip(null)} className="w-full py-3 rounded-xl bg-gray-700 text-gray-300 text-sm font-bold active:scale-95 transition-all">
              Close
            </button>
          </div>
        </div>
      )}

      {alarmTrip && (
        <TripAlarm
          trip={alarmTrip}
          onConfirm={handleConfirmFromAlarm}
          onDismiss={() => setAlarmTrip(null)}
        />
      )}

      {/* HEADER */}
      <div className="bg-primary px-4 pt-8 pb-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <FleetMark name={brandName} logoUrl={org?.brand_logo_url} size="sm" />
              {brandName && <p className="text-sm font-semibold text-primary-foreground truncate">{brandName}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {officeCall && (
                <a
                  href={officeCall}
                  className="flex min-h-[44px] items-center gap-2 rounded-full border border-primary-foreground/30 px-3 text-xs font-semibold text-primary-foreground active:scale-95 transition-all"
                >
                  <Phone className="h-4 w-4" aria-hidden /> Call office
                </a>
              )}
              <button
                onClick={async () => {
                  localStorage.removeItem('fleetos_driver');
                  localStorage.removeItem('fleetos_driver_screen');
                  sessionStorage.removeItem('fleetos_trip_phase');
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                aria-label="Log out"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-primary-foreground/30 text-primary-foreground active:scale-95 transition-all"
              >
                <Power className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-primary-foreground truncate">{greeting}</h1>
              <p className="text-xs text-primary-foreground/80 truncate">{myProfile?.plate_number ?? 'Ready'} - {myProfile?.vehicle_model ?? 'Vehicle pending'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isOnline && pendingSyncCount > 0 && (
                <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 px-2.5 py-1.5 rounded-full">
                  <WifiOff className="h-3 w-3 text-orange-300" />
                  <span className="text-xs font-semibold text-orange-200">{pendingSyncCount}</span>
                </div>
              )}
              <div className="flex min-h-[44px] items-center gap-2 bg-gray-800 px-3 rounded-full border border-gray-700">
                <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-xs font-semibold text-gray-200">{isOnline ? 'Online' : 'Offline'}</span>
                <Switch checked={isOnline} onCheckedChange={setIsOnline} aria-label="Online" className="scale-75" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-primary-foreground/15 rounded-xl p-3 text-center"><p className="text-lg font-semibold text-primary-foreground">{formatCurrency(todayRevenue)}</p><p className="text-xs text-primary-foreground/80">Collected</p></div>
            <div className="bg-primary-foreground/15 rounded-xl p-3 text-center"><p className="text-lg font-semibold text-primary-foreground">{completedTodayCount}</p><p className="text-xs text-primary-foreground/80">Completed</p></div>
            <div className="bg-primary-foreground/15 rounded-xl p-3 text-center"><p className="text-sm font-semibold text-primary-foreground">{gpsStatusLabel}</p><p className="text-xs text-primary-foreground/80">GPS</p></div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="max-w-lg mx-auto px-5 pt-4">
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { id: 'home' as DriverScreen, label: 'Home', icon: Car, badge: unconfirmedTrips },
            { id: 'active-trip' as DriverScreen, label: 'Active trip', icon: Navigation, badge: 0 },
            { id: 'expenses' as DriverScreen, label: 'Expenses', icon: Fuel, badge: pendingSyncCount },
            { id: 'earnings' as DriverScreen, label: 'Earnings', icon: Wallet, badge: 0 },
            { id: 'documents' as DriverScreen, label: 'Docs', icon: FileText, badge: 0 },
          ]).map(t => (
            <button key={t.id} onClick={() => setScreen(t.id)} className={`relative flex items-center gap-2 px-3 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${screen === t.id ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-orange-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* HOME */}
        {screen === 'home' && (
          <div className="space-y-4 pb-24">
            {!isOnline && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30">
                <WifiOff className="h-4 w-4 text-orange-400 flex-shrink-0" />
                <div><p className="text-sm font-bold text-orange-300">You're offline</p><p className="text-xs text-orange-400/70">Trip confirmations & expenses save locally</p></div>
              </div>
            )}
            {brandName && <FleetNote brandName={brandName} note={driverInfo?.welcome_note} rules={driverInfo?.rules} />}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-white flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-400" /> Upcoming trips</div>
                {unconfirmedTrips > 0 && <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold">{unconfirmedTrips} need confirmation</span>}
              </div>
              {sortedTrips.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No trips assigned yet</p>
              ) : (
                <div className="space-y-3">
                  {sortedTrips.map(trip => (
                    <ScheduledTripCard key={trip.id} trip={trip} isOffline={!isOnline} onConfirm={handleConfirmTrip} onTap={setDetailTrip} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE TRIP */}
       {screen === 'active-trip' && (
          <div className="space-y-4 pb-24">
            {!activeTrip && (
              <div className="text-center py-16">
                <Navigation className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">No active trip</p>
                <p className="text-xs text-gray-600 mt-1">Start a confirmed trip from Home</p>
              </div>
            )}
            {activeTrip && <Card className="p-4 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-3 text-white">Navigation</h3>
              <div className="h-44 bg-gray-800 rounded-xl mb-3 relative border border-gray-700">
                <DriverTripMap activeTrip={activeTrip} tripPhase={tripPhase} driverPosition={driverPosition} />
                <div className="absolute top-3 left-3 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-bold text-white z-10">
                  <Navigation className="h-3 w-3 inline mr-1 text-blue-400" />
                  {tripPhase === 'navigating' ? 'Head to pickup' : tripPhase === 'arrived' ? 'At pickup location' : tripPhase === 'started' ? 'Heading to drop' : 'Trip closed'}
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-green-500" /><span className="text-gray-200">{activeTrip?.pickup}</span></div>
                <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-gray-200">{activeTrip?.drop}</span></div>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700 mb-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{activeTrip?.customerName}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1"><Shield className="h-3 w-3 text-blue-400" /> Number protected</p>
                  </div>
                  <div className="text-right"><p className="text-lg font-black text-white">{formatCurrency(activeTrip?.fare ?? 0)}</p><p className="text-xs text-gray-400">{activeTrip.distance}</p></div>
                </div>
                {activeTrip?.notes && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-1">Instructions</p>
                    <p className="text-sm text-blue-100">{activeTrip.notes}</p>
                  </div>
                )}
                <ContactActions customerName={activeTrip.customerName} customerPhone={activeTrip.customerPhone} />
              </div>
              {tripPhase === 'navigating' && <button onClick={() => setTripPhase('arrived')} className="w-full py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-95 transition-all text-white font-bold">I've arrived at pickup</button>}
{tripPhase === 'arrived' && (
                <div className="space-y-3">
                  {myProfile?.is_temporary && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                      <p className="flex items-center gap-2 text-xs font-semibold text-orange-300 mb-2"><Camera className="h-4 w-4" aria-hidden /> Odometer photo required</p>
                      <label className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold cursor-pointer active:scale-95 transition-all">
                        <Camera className="h-4 w-4" />
                        Take start odometer photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={e => void handleOdometerPhoto('start', e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    disabled={tripSaving}
                    onClick={async () => {
                      const t = sortedTrips.find(t => t.status === 'confirmed');
                      const id = t ? parseInt(t.id.replace('BK-', ''), 10) : NaN;
                      if (isNaN(id)) { setTripPhase('started'); return; }
                      setTripSaving(true);
                      if (await handleStart(id)) setTripPhase('started');
                      setTripSaving(false);
                    }}
                    className="w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white font-bold disabled:opacity-60"
                  >
                    {tripSaving ? 'Starting…' : 'Start Trip'}
                  </button>
                </div>
                )}
{tripPhase === 'started' && (
                <div className="space-y-3">
                  {myProfile?.is_temporary && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                      <p className="flex items-center gap-2 text-xs font-semibold text-orange-300 mb-2"><Camera className="h-4 w-4" aria-hidden /> Odometer photo required before ending</p>
                      <label className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold cursor-pointer active:scale-95 transition-all">
                        <Camera className="h-4 w-4" />
                        Take end odometer photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={e => void handleOdometerPhoto('end', e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    disabled={tripSaving}
                    onClick={async () => {
                      const t = sortedTrips.find(t => t.status === 'active');
                      const id = t ? parseInt(t.id.replace('BK-', ''), 10) : NaN;
                      if (isNaN(id)) { setTripPhase('completed'); return; }
                      setTripSaving(true);
                      if (await handleComplete(id)) setTripPhase('completed');
                      setTripSaving(false);
                    }}
                    className="w-full py-3.5 rounded-xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all text-white font-bold disabled:opacity-60"
                  >
                    {tripSaving ? 'Ending…' : `End Trip · ${formatCurrency(activeTrip?.fare ?? 0)}`}
                  </button>
                </div>
              )}              {tripPhase === 'completed' && (
                <div className="text-center py-4">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                  <p className="font-black text-lg text-white">Trip completed</p>
                  <p className="text-sm text-gray-400 mb-3">Collected {formatCurrency(activeTrip?.fare ?? 0)}. Log any cash or trip expenses next.</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setTripPhase('navigating'); setScreen('home'); }} className="flex-1 min-h-[44px] rounded-xl bg-gray-700 text-gray-200 text-sm font-semibold active:scale-95 transition-all">Back to home</button>
                    <button onClick={() => { setTripPhase('navigating'); setScreen('expenses'); }} className="flex-1 min-h-[44px] rounded-xl bg-orange-500 text-gray-950 text-sm font-semibold active:scale-95 transition-all">Log expenses</button>
                  </div>
                </div>
              )}
            </Card>}
          </div>
        )}

        {screen === 'expenses' && (
          <ExpenseTracker isOffline={!isOnline} expenses={expenses} collections={collections} onAddExpense={addExpense} onAddCollection={addCollection} onDeleteExpense={deleteExpense} todayHandover={todayHandover ?? null} onHandOver={handleHandOver} handoverLoading={handoverLoading} />
        )}

        {screen === 'earnings' && (
          <div className="space-y-4 pb-24">
            <Card className="p-5 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-4 text-white">Earnings Overview</h3>
              <div className="grid grid-cols-3 gap-3">
                {[{ label: 'Today', amount: todayRevenue, trips: completedTodayCount }, { label: 'This Week', amount: weekRevenue, trips: completedWeekCount }, { label: 'This Month', amount: monthRevenue, trips: completedMonthCount }].map(period => (
                  <div key={period.label} className="text-center p-3 bg-gray-800 rounded-xl border border-gray-700">
                    <p className="text-lg font-black text-white">{formatCurrency(period.amount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase">{period.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{period.trips} trips</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-3 text-white">Performance</h3>
              <div className="space-y-4">
                <div><div className="flex justify-between text-sm mb-1"><span className="text-gray-400">Acceptance Rate</span><span className="font-bold text-white">{acceptanceRate}%</span></div><Progress value={acceptanceRate} className="h-2" /></div>
                <div><div className="flex justify-between text-sm mb-1"><span className="text-gray-400">GPS Visibility</span><span className="font-bold text-white">{driverPosition ? 'Live' : isOnline ? 'Pending' : 'Offline'}</span></div><Progress value={driverPosition ? 100 : isOnline ? 45 : 10} className="h-2" /></div>
              </div>
            </Card>
          </div>
        )}

        {screen === 'documents' && (
          <div className="space-y-4 pb-24">
            <Card className="p-5 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-white"><FileText className="h-4 w-4 text-blue-400" /> Documents</h3>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.name} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${doc.status === 'verified' ? 'bg-green-500/15' : doc.status === 'expiring' ? 'bg-orange-500/15' : 'bg-red-500/15'}`}>
                        {doc.status === 'verified' ? <CheckCircle className="h-4 w-4 text-green-400" /> : doc.status === 'expiring' ? <AlertTriangle className="h-4 w-4 text-orange-400" /> : <Clock className="h-4 w-4 text-red-400" />}
                      </div>
                      <div><p className="text-sm font-semibold text-white">{doc.name}</p>{doc.expiry && <p className="text-xs text-gray-400">Exp: {doc.expiry}</p>}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${doc.status === 'verified' ? 'bg-green-500/10 text-green-400 border-green-500/30' : doc.status === 'expiring' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>{doc.status}</span>
                      {doc.status !== 'verified' && <button className="flex items-center gap-1 h-7 px-2 text-xs rounded-lg bg-gray-700 text-gray-300 border border-gray-600 active:scale-95 transition-all"><Camera className="h-3 w-3" /> Upload</button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
