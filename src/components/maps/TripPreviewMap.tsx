import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, Route } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  estimatePolylineDistanceKm,
  olaDirections,
  olaGeocode,
  useOlaMaps,
} from '@/lib/olaMaps';
import type { LeafletMarker } from '@/lib/olaMaps';

interface TripPreviewMapProps {
  pickup?: string;
  drop?: string;
  stops?: string[];
  title?: string;
  subtitle?: string;
  className?: string;
  mapClassName?: string;
  // The assigned cab's last known position. Shown as a car marker that moves on updates.
  driverLocation?: { lat: number; lng: number } | null;
  driverLabel?: string;
}

type RouteStopKind = 'pickup' | 'stop' | 'drop';

interface ResolvedRouteStop {
  key: string;
  kind: RouteStopKind;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

const JAIPUR_CENTER = { lat: 26.9124, lng: 75.7873 };
const GEOCODE_DEBOUNCE_MS = 800;

function createStopMarker(label: string, kind: RouteStopKind, order?: number): HTMLElement {
  const marker = document.createElement('div');
  const palette =
    kind === 'pickup'
      ? { background: '#16a34a', text: '#ffffff' }
      : kind === 'drop'
        ? { background: '#dc2626', text: '#ffffff' }
        : { background: '#0f172a', text: '#f8fafc' };

  marker.className = 'flex h-11 w-11 items-center justify-center';
  marker.innerHTML = `
    <div style="
      width: 38px;
      height: 38px;
      border-radius: 999px;
      background: ${palette.background};
      color: ${palette.text};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 900;
      border: 3px solid rgba(255,255,255,0.96);
      box-shadow: 0 14px 28px rgba(15,23,42,0.24);
    ">${kind === 'stop' ? String(order ?? 1) : kind === 'pickup' ? 'P' : 'D'}</div>
  `;
  marker.setAttribute('aria-label', label);
  return marker;
}

function createDriverMarker(label: string): HTMLElement {
  const marker = document.createElement('div');
  marker.className = 'flex h-11 w-11 items-center justify-center';
  marker.innerHTML = `
    <div style="
      width: 40px;
      height: 40px;
      border-radius: 999px;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 3px solid #facc15;
      box-shadow: 0 14px 28px rgba(15,23,42,0.32);
    ">🚗</div>
  `;
  marker.setAttribute('aria-label', label);
  return marker;
}

export function TripPreviewMap({
  pickup = '',
  drop = '',
  stops = [],
  title = 'Live route preview',
  subtitle = 'Auto-fit map with route highlight',
  className,
  mapClassName,
  driverLocation = null,
  driverLabel = 'Your driver',
}: TripPreviewMapProps) {
  const [resolvedStops, setResolvedStops] = useState<ResolvedRouteStop[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeProvider, setRouteProvider] = useState<string>('Preparing preview');
  const markersRef = useRef<LeafletMarker[]>([]);
  const routeLayerIdsRef = useRef<string[]>([]);
  const driverMarkerRef = useRef<{ setLatLng: (latLng: [number, number]) => void; remove: () => void } | null>(null);
  const driverCoordsRef = useRef<[number, number] | null>(null);
  const stopCoordsRef = useRef<[number, number][]>([]);
  const driverLat = driverLocation?.lat ?? null;
  const driverLng = driverLocation?.lng ?? null;
  const stopSignature = [pickup, ...stops, drop].join('|');

  const routeStops: ResolvedRouteStop[] = [];
  if (pickup.trim()) {
    routeStops.push({
      key: 'pickup',
      kind: 'pickup',
      label: 'Pickup',
      address: pickup.trim(),
      lat: null,
      lng: null,
    });
  }
  stops
    .map(stop => stop.trim())
    .filter(Boolean)
    .forEach((stop, index) => {
      routeStops.push({
        key: `stop-${index}`,
        kind: 'stop',
        label: `Stop ${index + 1}`,
        address: stop,
        lat: null,
        lng: null,
      });
    });
  if (drop.trim()) {
    routeStops.push({
      key: 'drop',
      kind: 'drop',
      label: 'Drop',
      address: drop.trim(),
      lat: null,
      lng: null,
    });
  }

  const firstResolved = resolvedStops.find(stop => stop.lat != null && stop.lng != null);
  const defaultCenter = firstResolved
    ? { lat: firstResolved.lat!, lng: firstResolved.lng! }
    : JAIPUR_CENTER;

  const { addMarker, containerRef, drawRoute, error, fitBounds, isLoaded, providerLabel, removeRoute } = useOlaMaps(defaultCenter, 12);

  // Wait for typing to pause before geocoding: each lookup can hit up to three providers, and
  // the free OpenStreetMap server blocks apps that send it a request per keystroke.
  useEffect(() => {
    let cancelled = false;

    const resolveStops = async () => {
      if (routeStops.length === 0) {
        setResolvedStops([]);
        setRouteDistanceKm(null);
        setRouteProvider('Add pickup to start the preview');
        return;
      }

      setIsResolving(true);
      const nextStops = await Promise.all(
        routeStops.map(async stop => {
          const details = await olaGeocode(stop.address);
          return {
            ...stop,
            lat: details?.lat ?? null,
            lng: details?.lng ?? null,
          };
        })
      );

      if (cancelled) return;

      setResolvedStops(nextStops);
      setIsResolving(false);
    };

    const timer = window.setTimeout(() => void resolveStops(), GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [stopSignature]);

  useEffect(() => {
    if (!isLoaded) return;

    markersRef.current.forEach(marker => marker?.remove?.());
    markersRef.current = [];
    routeLayerIdsRef.current.forEach(removeRoute);
    routeLayerIdsRef.current = [];

    const visibleStops = resolvedStops.filter(
      stop => typeof stop.lat === 'number' && typeof stop.lng === 'number'
    );

    let stopOrder = 0;

    visibleStops.forEach(stop => {
      const order = stop.kind === 'stop' ? ++stopOrder : undefined;
      const marker = addMarker({
        lat: stop.lat!,
        lng: stop.lng!,
        element: createStopMarker(stop.label, stop.kind, order),
        label: `
          <div style="padding:10px 12px;min-width:170px">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#64748b">${stop.label}</div>
            <div style="margin-top:6px;font-size:13px;font-weight:700;color:#0f172a">${stop.address}</div>
          </div>
        `,
      });
      if (marker) markersRef.current.push(marker);
    });

    if (visibleStops.length === 0) {
      setRouteDistanceKm(null);
      setRouteProvider('Add a recognised address to preview the route');
      return;
    }

    stopCoordsRef.current = visibleStops.map(stop => [stop.lng!, stop.lat!] as [number, number]);
    fitBounds(
      driverCoordsRef.current ? [...stopCoordsRef.current, driverCoordsRef.current] : stopCoordsRef.current,
      56
    );

    if (visibleStops.length < 2) {
      setRouteDistanceKm(null);
      setRouteProvider('Add a destination to highlight the route');
      return;
    }

    let cancelled = false;

    const drawSegments = async () => {
      let distanceKm = 0;
      const providers = new Set<string>();

      for (let index = 0; index < visibleStops.length - 1; index += 1) {
        const origin = visibleStops[index];
        const destination = visibleStops[index + 1];
        const route = await olaDirections(
          { lat: origin.lat!, lng: origin.lng! },
          { lat: destination.lat!, lng: destination.lng! }
        );

        if (cancelled || !route?.polyline) continue;

        distanceKm += estimatePolylineDistanceKm(route.polyline);
        providers.add(route.provider.toUpperCase());

        const haloLayer = drawRoute(route.polyline, {
          color: '#ffffff',
          weight: 11,
          opacity: 0.92,
        });
        const lineLayer = drawRoute(route.polyline, {
          color: '#2563eb',
          weight: 5.5,
          opacity: 0.9,
        });

        if (haloLayer) routeLayerIdsRef.current.push(haloLayer);
        if (lineLayer) routeLayerIdsRef.current.push(lineLayer);
      }

      if (cancelled) return;

      setRouteDistanceKm(distanceKm > 0 ? distanceKm : null);
      setRouteProvider(providers.size > 0 ? `${Array.from(providers).join(' + ')} route` : 'Marker preview');
    };

    void drawSegments();

    return () => {
      cancelled = true;
      markersRef.current.forEach(marker => marker?.remove?.());
      markersRef.current = [];
      routeLayerIdsRef.current.forEach(removeRoute);
      routeLayerIdsRef.current = [];
    };
  }, [addMarker, drawRoute, fitBounds, isLoaded, removeRoute, resolvedStops]);

  // The cab marker has its own effect so a new GPS fix moves it instead of rebuilding the
  // pins and route, which would flicker and re-request directions on every poll.
  useEffect(() => {
    if (!isLoaded) return;

    if (driverLat === null || driverLng === null) {
      driverMarkerRef.current?.remove?.();
      driverMarkerRef.current = null;
      driverCoordsRef.current = null;
      return;
    }

    driverCoordsRef.current = [driverLng, driverLat];
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng]);
      return;
    }

    driverMarkerRef.current = addMarker({
      lat: driverLat,
      lng: driverLng,
      element: createDriverMarker(driverLabel),
      label: `<div style="padding:10px 12px;font-size:13px;font-weight:700;color:#0f172a">${driverLabel}</div>`,
    });
    // Frame the cab together with the trip the first time it appears.
    fitBounds([...stopCoordsRef.current, [driverLng, driverLat]], 56);
  }, [addMarker, driverLabel, driverLat, driverLng, fitBounds, isLoaded]);

  useEffect(() => () => {
    driverMarkerRef.current?.remove?.();
    driverMarkerRef.current = null;
  }, []);

  const stopCount = Math.max(0, routeStops.filter(stop => stop.kind === 'stop').length);

  return (
    <div className={cn('overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-elevated', className)}>
      <div className="relative">
        <div ref={containerRef} className={cn('h-[320px] w-full bg-muted', mapClassName)} />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/32 via-slate-950/10 to-transparent" />

        <div className="absolute left-4 top-4 z-10 max-w-[85%] rounded-2xl border border-white/70 bg-white/92 px-4 py-3 shadow-lg backdrop-blur-md">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{subtitle}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{providerLabel}</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{routeProvider}</span>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-2">
          <div className="rounded-2xl bg-slate-950/88 px-4 py-2.5 text-white shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Route className="h-3.5 w-3.5 text-blue-300" />
              {routeDistanceKm ? `${routeDistanceKm.toFixed(1)} km highlighted` : 'Pins ready'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/92 px-4 py-2.5 text-slate-700 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Navigation className="h-3.5 w-3.5 text-emerald-600" />
              {stopCount > 0 ? `${stopCount} stop${stopCount > 1 ? 's' : ''}` : 'Direct ride'}
            </div>
          </div>
        </div>

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/92 px-6 text-center">
            <MapPin className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">Map preview unavailable</p>
            <p className="mt-2 text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {!error && isResolving && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 text-sm font-semibold text-white backdrop-blur-[1px]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Building route preview...
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-slate-50/85 px-4 py-3">
        <div className="space-y-2">
          {routeStops.length === 0 && (
            <p className="text-sm text-muted-foreground">Pickup and destination will appear here as you build the trip.</p>
          )}
          {routeStops.map(stop => (
            <div key={stop.key} className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-1 h-2.5 w-2.5 rounded-full',
                  stop.kind === 'pickup' && 'bg-green-500',
                  stop.kind === 'drop' && 'bg-red-500',
                  stop.kind === 'stop' && 'bg-slate-900'
                )}
              />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {stop.label}
                </p>
                <p className="truncate text-sm font-semibold text-slate-900">{stop.address}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
