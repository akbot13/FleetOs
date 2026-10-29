import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { olaDirections, olaGeocode, useOlaMaps } from '@/lib/olaMaps';
import type { LeafletMarker } from '@/lib/olaMaps';
import type { TripPhase, MockTrip } from './types';
import { JAIPUR_CENTER, PICKUP_FALLBACK, DROP_FALLBACK } from './helpers';

// ─── TRIP MAP ───

export function DriverTripMap({
  activeTrip,
  tripPhase,
  driverPosition,
}: {
  activeTrip: MockTrip;
  tripPhase: TripPhase;
  driverPosition: { lat: number; lng: number } | null;
}) {
  const { addMarker, containerRef, drawRoute, error, fitBounds, isLoaded, providerLabel, removeRoute } = useOlaMaps(JAIPUR_CENTER, 12);
  const markersRef = useRef<LeafletMarker[]>([]);
  const routeLayerRef = useRef<string[]>([]);
  const [points, setPoints] = useState<{ pickup: { lat: number; lng: number }; drop: { lat: number; lng: number } }>({
    pickup: PICKUP_FALLBACK,
    drop: DROP_FALLBACK,
  });
  const [isResolving, setIsResolving] = useState(false);
  const [routeProviderLabel, setRouteProviderLabel] = useState('Resolving route');

  useEffect(() => {
    let cancelled = false;

    const resolveTripPoints = async () => {
      setIsResolving(true);

      try {
        const [pickup, drop] = await Promise.all([
          olaGeocode(activeTrip.pickup),
          olaGeocode(activeTrip.drop),
        ]);

        if (cancelled) return;

        setPoints({
          pickup: pickup ?? PICKUP_FALLBACK,
          drop: drop ?? DROP_FALLBACK,
        });
      } catch {
        if (!cancelled) {
          setPoints({ pickup: PICKUP_FALLBACK, drop: DROP_FALLBACK });
        }
      } finally {
        if (!cancelled) setIsResolving(false);
      }
    };

    resolveTripPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTrip.drop, activeTrip.pickup]);

  useEffect(() => {
    if (!isLoaded) return;
    setRouteProviderLabel('Resolving route');

    markersRef.current.forEach(marker => marker?.remove?.());
    markersRef.current = [];

    routeLayerRef.current.forEach(removeRoute);
    routeLayerRef.current = [];

    const fallbackDriverPoint =
      tripPhase === 'started' || tripPhase === 'completed'
        ? points.pickup
        : tripPhase === 'arrived'
          ? points.pickup
          : JAIPUR_CENTER;
    const driverPoint = driverPosition ?? fallbackDriverPoint;
    const routeTarget = tripPhase === 'started' ? points.drop : points.pickup;

    const driverMarker = addMarker({
      lat: driverPoint.lat,
      lng: driverPoint.lng,
      color: '#3b82f6',
      label: '<div style="padding:6px 8px;font-size:12px;font-weight:700">You</div>',
    });
    if (driverMarker) markersRef.current.push(driverMarker);

    const pickupMarker = addMarker({
      lat: points.pickup.lat,
      lng: points.pickup.lng,
      color: '#22c55e',
      label: `<div style="padding:6px 8px;font-size:12px;font-weight:700">${activeTrip.customerName}</div><div style="padding:0 8px 6px;font-size:11px;color:#64748b">${activeTrip.pickup}</div>`,
    });
    if (pickupMarker) markersRef.current.push(pickupMarker);

    const dropMarker = addMarker({
      lat: points.drop.lat,
      lng: points.drop.lng,
      color: '#ef4444',
      label: `<div style="padding:6px 8px;font-size:12px;font-weight:700">Drop</div><div style="padding:0 8px 6px;font-size:11px;color:#64748b">${activeTrip.drop}</div>`,
    });
    if (dropMarker) markersRef.current.push(dropMarker);

    fitBounds(
      [
        [driverPoint.lng, driverPoint.lat],
        [points.pickup.lng, points.pickup.lat],
        [points.drop.lng, points.drop.lat],
      ],
      68
    );

    if (tripPhase === 'completed') {
      setRouteProviderLabel('Trip completed');
    } else {
      let cancelled = false;
      olaDirections(driverPoint, routeTarget)
        .then(route => {
          if (cancelled || !route?.polyline) {
            setRouteProviderLabel('Marker fallback');
            return;
          }
          const haloLayer = drawRoute(route.polyline, {
            color: '#ffffff',
            weight: 10,
            opacity: 0.88,
          });
          const lineLayer = drawRoute(route.polyline, {
            color: '#2563eb',
            weight: 5.5,
            opacity: 0.92,
          });
          routeLayerRef.current = [haloLayer, lineLayer].filter(Boolean) as string[];
          setRouteProviderLabel(`${route.provider.toUpperCase()} routing`);
        })
        .catch(() => {
          setRouteProviderLabel('Marker fallback');
        });

      return () => {
        cancelled = true;
        markersRef.current.forEach(marker => marker?.remove?.());
        markersRef.current = [];
        routeLayerRef.current.forEach(removeRoute);
        routeLayerRef.current = [];
      };
    }

    return () => {
      markersRef.current.forEach(marker => marker?.remove?.());
      markersRef.current = [];
      routeLayerRef.current.forEach(removeRoute);
      routeLayerRef.current = [];
    };
  }, [activeTrip.customerName, activeTrip.drop, activeTrip.pickup, addMarker, drawRoute, driverPosition, fitBounds, isLoaded, points, removeRoute, tripPhase]);

  const fallbackTitle = 'Unable to load the trip map';
  const fallbackBody = error ?? 'The trip map could not be loaded right now. Check the browser network tab and try again.';

  return (
    <div className="h-full w-full rounded-xl overflow-hidden relative">
      <div ref={containerRef} className="h-full w-full rounded-xl" />

      <div className="absolute top-3 right-3 z-10 rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Map stack</p>
        <p className="mt-1 text-xs font-semibold text-slate-900">{providerLabel}</p>
        <p className="mt-1 text-[11px] text-slate-500">{routeProviderLabel}</p>
      </div>

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 px-5 text-center">
          <MapPin className="h-8 w-8 text-gray-500 mb-3" />
          <p className="text-sm font-bold text-white">{fallbackTitle}</p>
          <p className="text-xs text-gray-400 mt-2">
            {fallbackBody}
          </p>
        </div>
      )}

      {!error && isResolving && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/55 text-xs font-semibold text-white backdrop-blur-[1px]">
          Resolving route...
        </div>
      )}
    </div>
  );
}
