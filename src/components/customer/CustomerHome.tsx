import { useEffect, useState } from 'react';
import { Car, ChevronRight, Clock, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react';
import { FleetMark } from '@/components/FleetMark';
import { TripTypeIcon } from '@/components/TripTypeIcon';
import { BookingFlow } from './BookingFlow';
import { TrackBooking } from './TrackBooking';
import { useFixedRoutes, useLastBooking } from '@/hooks/useSupabaseData';
import { useDriversPublic } from '@/hooks/useDriversPublic';
import { useOrg } from '@/hooks/useOrg';
import { isClosedStatus, useBookingStatus } from '@/hooks/useBookingStatus';
import { telHref, whatsappHref } from '@/lib/contact';
import { resolveHighlights } from '@/lib/fleetHighlights';
import { cn } from '@/lib/utils';
import {
  clearSavedTrackingToken,
  clearTrackingTokenFromUrl,
  readSavedTrackingToken,
  readTrackingTokenFromUrl,
} from '@/lib/trackingStorage';

type View = 'home' | 'booking' | 'track';

interface CustomerHomeProps {
  /** Quiet sign-in links at the foot of the page. Left out for signed-in staff, who have their own switcher. */
  staffLinks?: { onDriver: () => void; onOwner: () => void };
}

const clean = (value: string | null | undefined) => value?.trim() || null;

export function CustomerHome({ staffLinks }: CustomerHomeProps = {}) {
  // A tracking link (?track=<token>) opens the live map straight away.
  const [trackToken, setTrackToken] = useState<string | null>(() => readTrackingTokenFromUrl());
  const [view, setView] = useState<View>(() => (readTrackingTokenFromUrl() ? 'track' : 'home'));
  const [savedToken] = useState<string | null>(() => readSavedTrackingToken());
  const [repeatData, setRepeatData] = useState<typeof lastBooking>(null);
  const { org } = useOrg();
  const { data: routes = [] } = useFixedRoutes();
  const { data: drivers = [] } = useDriversPublic();
  const { data: lastBooking } = useLastBooking();

  const freeCount = drivers.filter(d => d.status === 'free').length;

  // The latest booking made on this device, offered as "Track your ride" while it is still open.
  const { data: savedBooking } = useBookingStatus(view === 'home' ? savedToken : null, { poll: false });
  const savedBookingClosed = savedBooking === null || isClosedStatus(savedBooking?.status);
  useEffect(() => {
    if (savedToken && savedBookingClosed) clearSavedTrackingToken();
  }, [savedToken, savedBookingClosed]);

  const closeTracking = () => {
    clearTrackingTokenFromUrl();
    setTrackToken(null);
    setView('home');
  };

  if (view === 'track' && trackToken) {
    return (
      <div className="min-h-screen bg-background px-6 py-6">
        <div className="max-w-md mx-auto">
          <TrackBooking token={trackToken} onDone={closeTracking} />
        </div>
      </div>
    );
  }

  if (view === 'booking') return <BookingFlow onBack={() => { setRepeatData(null); setView('home'); }} initialData={repeatData} />;

  const brandName = clean(org?.brand_name);
  const tagline = clean(org?.tagline);
  const welcome = clean(org?.welcome_message);
  const serviceArea = clean(org?.service_area);
  const serviceHours = clean(org?.service_hours);
  const coverUrl = clean(org?.cover_image_url);
  const highlights = resolveHighlights(org?.highlights);
  const call = telHref(org?.support_phone);
  const whatsapp = whatsappHref(org?.whatsapp_phone);
  const listedRoutes = routes.filter(r => r.origin && r.destination);

  const heroText = coverUrl ? 'text-white' : 'text-primary-foreground';
  const heroSoft = coverUrl ? 'text-white/85' : 'text-primary-foreground/80';
  const hasBento = freeCount > 0 || !!serviceArea || !!serviceHours || highlights.length > 0 || !!welcome || !!(call || whatsapp);
  const onlyCarsTile = freeCount > 0 && !serviceArea && !serviceHours && highlights.length === 0 && !welcome && !call && !whatsapp;
  // Hours and area share a row when both are set; a lone one takes the full row unless cars sit beside it.
  const hoursWide = !!serviceHours && freeCount === 0 && !serviceArea;
  const areaWide = !!serviceArea && ((freeCount > 0) === !!serviceHours);

  return (
    <div className="customer-ui min-h-screen flex flex-col">
      {/* Hero: cover photo with a dark scrim, or solid brand colour. No map here. */}
      <header className={cn('relative overflow-hidden rounded-b-[32px] bg-primary px-6 pt-12 pb-16', heroText)}>
        {coverUrl && (
          <>
            <img
              src={coverUrl}
              alt=""
              width={1200}
              height={800}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" aria-hidden />
          </>
        )}
        <div className="relative mx-auto flex min-h-[280px] max-w-md flex-col">
          <div className="flex items-center gap-3">
            <FleetMark name={brandName} logoUrl={org?.brand_logo_url} size="md" />
            {brandName && <span className="min-w-0 break-words text-base font-semibold">{brandName}</span>}
          </div>
          <div className="mt-auto pt-24">
            <h1 className="cu-serif text-5xl">Where to?</h1>
            {tagline && <p className={cn('mt-3 text-base', heroSoft)}>{tagline}</p>}
          </div>
        </div>
      </header>

      <div className="relative z-10 -mt-7 px-6">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => setView('booking')}
            className="cu-pill flex h-14 w-full items-center justify-between bg-foreground px-6 text-base font-semibold text-background shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="flex items-center gap-3"><Car className="h-5 w-5" aria-hidden />Book a ride</span>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-6 pb-8 pt-6">
        {lastBooking?.pickup && lastBooking.drop && (
          <button
            type="button"
            onClick={() => { setRepeatData(lastBooking); setView('booking'); }}
            className="cu-card flex min-h-[64px] w-full items-center justify-between gap-3 p-4 text-left"
          >
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">Book again</p>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <TripTypeIcon type={lastBooking.trip_type ?? 'city'} className="h-4 w-4 shrink-0" />
                <span className="truncate">{lastBooking.pickup} to {lastBooking.drop}</span>
              </p>
              {lastBooking.fare != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ₹{lastBooking.fare.toLocaleString('en-IN')} · {new Date(lastBooking.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}

        {savedToken && savedBooking && !savedBookingClosed && (
          <button
            type="button"
            onClick={() => { setTrackToken(savedToken); setView('track'); }}
            className="cu-card cu-tint flex min-h-[64px] w-full items-center justify-between gap-3 p-4 text-left"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Navigation className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Track your ride</p>
                <p className="truncate text-xs text-muted-foreground">
                  {savedBooking.driver ? `${savedBooking.driver.name ?? 'Your driver'} is assigned` : 'Finding your driver'} · #{savedBooking.id}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}

        {hasBento && (
          <div className="grid grid-cols-2 gap-3">
            {freeCount > 0 && (
              <div className={cn('cu-card cu-tint p-5', onlyCarsTile && 'col-span-2')}>
                <span className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse-dot" aria-hidden />
                  {freeCount === 1 ? 'Car available now' : 'Cars available now'}
                </span>
                <p className="cu-serif mt-2 text-5xl">{freeCount}</p>
              </div>
            )}
            {serviceHours && (
              <div className={cn('cu-card p-5', hoursWide && 'col-span-2')}>
                <Clock className="h-5 w-5 text-primary" aria-hidden />
                <p className="mt-3 text-xs text-muted-foreground">Service hours</p>
                <p className="break-words text-sm font-semibold">{serviceHours}</p>
              </div>
            )}
            {serviceArea && (
              <div className={cn('cu-card p-5', areaWide && 'col-span-2')}>
                <MapPin className="h-5 w-5 text-primary" aria-hidden />
                <p className="mt-3 text-xs text-muted-foreground">Service area</p>
                <p className="break-words text-sm font-semibold">{serviceArea}</p>
              </div>
            )}
            {highlights.length > 0 && (
              <ul className="cu-card col-span-2 flex flex-wrap gap-2 p-4">
                {highlights.map(h => (
                  <li key={h.id} className="cu-pill cu-tint flex min-h-[36px] items-center gap-2 px-3 text-sm">
                    <h.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {h.label}
                  </li>
                ))}
              </ul>
            )}
            {welcome && <p className="cu-card col-span-2 p-5 text-base leading-relaxed">{welcome}</p>}
            {(call || whatsapp) && (
              <div className="cu-card col-span-2 flex items-center justify-between gap-3 p-5">
                <div>
                  <p className="cu-serif text-2xl">Need help?</p>
                  <p className="text-xs text-muted-foreground">Talk to us directly</p>
                </div>
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
          </div>
        )}

        {listedRoutes.length > 0 && (
          <section>
            <h2 className="cu-serif mb-3 text-2xl">Popular routes</h2>
            <ul className="cu-card divide-y overflow-hidden">
              {listedRoutes.map(route => (
                <li key={route.id}>
                  <button
                    type="button"
                    onClick={() => setView('booking')}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{route.origin} to {route.destination}</span>
                      {route.per_km_rate ? <span className="block text-xs text-muted-foreground">₹{route.per_km_rate}/km</span> : null}
                    </span>
                    {route.fixed_fare != null && (
                      <span className="shrink-0 text-sm font-semibold">₹{route.fixed_fare.toLocaleString('en-IN')}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="mx-auto w-full max-w-md px-6 pb-8 text-center">
        {staffLinks && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <button onClick={staffLinks.onDriver} className="min-h-[44px] px-3 underline-offset-4 hover:underline">
              Driver sign-in
            </button>
            <span aria-hidden>·</span>
            <button data-testid="open-login" onClick={staffLinks.onOwner} className="min-h-[44px] px-3 underline-offset-4 hover:underline">
              Owner sign-in
            </button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Powered by FleetOs</p>
      </footer>
    </div>
  );
}
