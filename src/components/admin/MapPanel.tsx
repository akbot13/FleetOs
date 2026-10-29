import { useEffect, useRef } from 'react';
import { Activity, Car, MapPin, Navigation } from 'lucide-react';
import { getDriverInitials, useDrivers } from '@/hooks/useSupabaseData';
import { getMapStackLabel, useOlaMaps } from '@/lib/olaMaps';
import type { LeafletMarker } from '@/lib/olaMaps';

const JAIPUR_CENTER = { lat: 26.9124, lng: 75.7873 };

function createDriverMarker(name: string, status: string | null): HTMLElement {
  const color = status === 'free' ? '#22c55e' : status === 'on-trip' ? '#f59e0b' : '#64748b';

  const marker = document.createElement('div');
  marker.className = 'flex h-11 w-11 items-center justify-center';
  marker.innerHTML = `
    <div style="
      width: 38px;
      height: 38px;
      border-radius: 999px;
      background: ${color};
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      border: 2px solid rgba(255,255,255,0.95);
      box-shadow: 0 10px 24px rgba(15,23,42,0.25);
    ">${getDriverInitials(name)}</div>
  `;
  return marker;
}

export function MapPanel() {
  const { data: drivers = [] } = useDrivers();
  const markersRef = useRef<LeafletMarker[]>([]);

  const driversOnMap = drivers.filter(driver => driver.status !== 'offline' && driver.location_lat && driver.location_lng);
  const freeCount = drivers.filter(driver => driver.status === 'free').length;
  const onTripCount = drivers.filter(driver => driver.status === 'on-trip').length;
  const stackLabel = getMapStackLabel();

  const defaultCenter = driversOnMap[0]
    ? { lat: driversOnMap[0].location_lat!, lng: driversOnMap[0].location_lng! }
    : JAIPUR_CENTER;

  const { containerRef, error, fitBounds, isLoaded, addMarker, providerLabel } = useOlaMaps(defaultCenter, 11);

  useEffect(() => {
    if (!isLoaded) return;

    markersRef.current.forEach(marker => marker?.remove?.());
    markersRef.current = [];

    driversOnMap.forEach(driver => {
      const marker = addMarker({
        lat: driver.location_lat!,
        lng: driver.location_lng!,
        element: createDriverMarker(driver.name ?? 'Driver', driver.status),
        label: `
          <div style="padding:8px 10px;min-width:140px">
            <div style="font-weight:700;font-size:13px;color:#0f172a">${driver.name ?? 'Driver'}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${driver.vehicle_model ?? 'Vehicle pending'}${driver.plate_number ? ` · ${driver.plate_number}` : ''}</div>
            <div style="font-size:11px;color:${driver.status === 'free' ? '#16a34a' : '#d97706'};margin-top:6px;text-transform:capitalize">${driver.status === 'on-trip' ? 'On Trip' : driver.status ?? 'Unknown'}</div>
          </div>
        `,
      });
      if (marker) markersRef.current.push(marker);
    });

    if (driversOnMap.length > 0) {
      fitBounds(
        driversOnMap.map(driver => [driver.location_lng!, driver.location_lat!] as [number, number]),
        72
      );
    }

    return () => {
      markersRef.current.forEach(marker => marker?.remove?.());
      markersRef.current = [];
    };
  }, [addMarker, driversOnMap, fitBounds, isLoaded]);

  const activeCount = driversOnMap.length;
  const fallbackTitle = 'Unable to load the dispatch map';
  const fallbackBody = error ?? 'The live map could not be loaded right now. Check the browser network tab and try again.';

  return (
    <div className="col-span-7 min-h-[500px] overflow-hidden rounded-[2.5rem] border border-border/60 bg-card shadow-2xl shadow-slate-200/30 relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/28 via-slate-950/6 to-transparent z-10" />

      <div className="absolute top-5 left-5 z-20 flex max-w-[320px] flex-col gap-3">
        <div className="rounded-[1.75rem] border border-slate-900/8 bg-white/92 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                Dispatch Map
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">{activeCount}</p>
              <p className="text-xs font-semibold text-slate-500">
                live driver{activeCount === 1 ? '' : 's'} on the board
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950 px-3 py-2 text-white shadow-lg">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]">
                <Activity className="h-3.5 w-3.5 text-emerald-300" />
                Live
              </div>
              <p className="mt-2 text-xs font-semibold text-white/70">{stackLabel}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-emerald-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Free</p>
              <p className="mt-1 text-lg font-black text-emerald-900">{freeCount}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">On Trip</p>
              <p className="mt-1 text-lg font-black text-amber-900">{onTripCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/88 px-3.5 py-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Navigation className="h-3.5 w-3.5 text-teal-600" />
            {error ? 'Map network degraded' : `Map stack: ${providerLabel}`}
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-2xl bg-slate-950/86 px-4 py-2.5 text-white backdrop-blur-md">
        <Car className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-xs font-bold">
          {activeCount} driver{activeCount !== 1 ? 's' : ''} on map
        </span>
      </div>

      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/90 px-4 py-2.5 text-slate-700 shadow-lg backdrop-blur-md">
        <MapPin className="h-3.5 w-3.5 text-teal-600" />
        <span className="text-xs font-bold">GPS publishes from the driver app</span>
      </div>

      <div ref={containerRef} className="w-full h-full min-h-[500px]" />

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/92 text-center px-8">
          <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-base font-semibold text-foreground">
            {fallbackTitle}
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            {fallbackBody}
          </p>
        </div>
      )}

      {!error && activeCount === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/35 pointer-events-none">
          <MapPin className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No driver locations available</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Live locations appear here once drivers allow GPS in the driver app.</p>
        </div>
      )}
    </div>
  );
}
