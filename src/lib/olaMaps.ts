import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
// Integrity hashes of the official 1.9.4 files: the browser refuses a changed copy from the CDN.
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

let leafletLoadPromise: Promise<void> | null = null;

export type FleetMapProvider = 'ola' | 'mappls' | 'nominatim' | 'osrm' | 'leaflet';

export class OlaMapsApiError extends Error {
  status: number;
  provider: FleetMapProvider | 'unknown';

  constructor(message: string, status = 0, provider: FleetMapProvider | 'unknown' = 'unknown') {
    super(message);
    this.name = 'OlaMapsApiError';
    this.status = status;
    this.provider = provider;
  }
}

export interface OlaPlacePrediction {
  place_id: string;
  description: string;
  lat?: number;
  lng?: number;
  provider?: Exclude<FleetMapProvider, 'osrm' | 'leaflet'>;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

export interface OlaPlaceDetails {
  address: string;
  lat: number;
  lng: number;
  provider?: Exclude<FleetMapProvider, 'osrm' | 'leaflet'>;
}

export interface RouteResult {
  polyline: string;
  provider: Exclude<FleetMapProvider, 'leaflet'>;
}

export interface RouteDrawOptions {
  color?: string;
  weight?: number;
  opacity?: number;
}

function appendStylesheet(href: string, integrity?: string) {
  const existing = document.querySelector(`link[data-fleetos-href="${href}"]`);
  if (existing) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-fleetos-href', href);
  if (integrity) {
    link.integrity = integrity;
    link.crossOrigin = 'anonymous';
  }
  document.head.appendChild(link);
}

function loadLeaflet(): Promise<void> {
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    if (window.L) {
      resolve();
      return;
    }

    appendStylesheet(LEAFLET_CSS_URL, LEAFLET_CSS_SRI);

    const script = document.createElement('script');
    script.src = LEAFLET_JS_URL;
    script.integrity = LEAFLET_JS_SRI;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load the map runtime'));
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

function asNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function normalizeAddress(...values: unknown[]): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim())
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ');
}

function buildPrediction(
  provider: Exclude<FleetMapProvider, 'osrm' | 'leaflet'>,
  description: string,
  placeId: string,
  options: {
    lat?: number | null;
    lng?: number | null;
    mainText?: string;
    secondaryText?: string;
  } = {}
): OlaPlacePrediction {
  return {
    place_id: placeId,
    description,
    provider,
    lat: options.lat ?? undefined,
    lng: options.lng ?? undefined,
    structured_formatting: {
      main_text: options.mainText,
      secondary_text: options.secondaryText,
    },
  };
}

function normalizeDetails(
  provider: Exclude<FleetMapProvider, 'osrm' | 'leaflet'>,
  address: string,
  lat: number | null,
  lng: number | null
): OlaPlaceDetails | null {
  if (lat == null || lng == null) return null;

  return {
    address: address.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat,
    lng,
    provider,
  };
}

function encodeLatLng(lat: number, lng: number) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

async function fetchJson<T>(
  url: string,
  provider: FleetMapProvider,
  init?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch (error) {
    throw new OlaMapsApiError(
      error instanceof Error ? error.message : `Unable to reach ${provider} right now.`,
      0,
      provider
    );
  }

  if (!response.ok) {
    let message = `${provider} request failed (${response.status})`;

    try {
      const payload = await response.json();
      message = payload?.error?.message ?? payload?.message ?? payload?.error ?? message;
    } catch {
      // Keep the fallback message when the provider does not return JSON.
    }

    throw new OlaMapsApiError(message, response.status, provider);
  }

  return response.json() as Promise<T>;
}

export function getOlaMapsApiKey(): string {
  return import.meta.env.VITE_OLA_MAPS_API_KEY?.trim() ?? '';
}

export function getMapplsAccessToken(): string {
  return import.meta.env.VITE_MAPPLS_ACCESS_TOKEN?.trim() ?? '';
}

export function isOlaMapsConfigured(): boolean {
  return Boolean(getOlaMapsApiKey());
}

export function isMapplsConfigured(): boolean {
  return Boolean(getMapplsAccessToken());
}

export function hasLocationSearchProvider(): boolean {
  return true;
}

export function getMapStackLabel(): string {
  if (isOlaMapsConfigured() && isMapplsConfigured()) return 'Ola primary, Mappls backup';
  if (isOlaMapsConfigured()) return 'Ola primary';
  if (isMapplsConfigured()) return 'Mappls primary';
  return 'Open fallback';
}

export function olaUrl(endpoint: string, params: Record<string, string> = {}): string {
  const url = new URL(`https://api.olamaps.io${endpoint}`);
  url.searchParams.set('api_key', getOlaMapsApiKey());
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function mapplsUrl(host: 'search' | 'route', path: string, params: Record<string, string> = {}): string {
  const base = host === 'route' ? 'https://route.mappls.com' : 'https://search.mappls.com';
  const url = new URL(`${base}${path}`);
  url.searchParams.set('access_token', getMapplsAccessToken());
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function olaAutocompleteOnly(input: string): Promise<OlaPlacePrediction[]> {
  const payload = await fetchJson<{ predictions?: OlaPlacePrediction[] }>(
    olaUrl('/places/v1/autocomplete', { input }),
    'ola'
  );

  return (payload.predictions ?? []).map(prediction => ({
    ...prediction,
    provider: 'ola',
  }));
}

async function mapplsAutocompleteOnly(input: string): Promise<OlaPlacePrediction[]> {
  const payload = await fetchJson<any>(
    mapplsUrl('search', '/search/places/autosuggest/json', {
      query: input,
      region: 'IND',
    }),
    'mappls'
  );

  const suggestions = Array.isArray(payload?.suggestedLocations)
    ? payload.suggestedLocations
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return suggestions
    .map((suggestion: any) => {
      const description = normalizeAddress(
        suggestion.placeName,
        suggestion.placeAddress,
        suggestion.address,
        suggestion.formattedAddress
      );
      const mainText = suggestion.placeName ?? suggestion.keyword ?? description;
      const secondaryText = suggestion.placeAddress ?? suggestion.address ?? '';
      const placeId = suggestion.eLoc ?? suggestion.eloc ?? suggestion.placeId ?? description;

      return buildPrediction('mappls', description || mainText || input, `mappls:${placeId}`, {
        lat: asNumber(
          suggestion.latitude,
          suggestion.lat,
          suggestion.entryLatitude,
          suggestion.entry_lat
        ),
        lng: asNumber(
          suggestion.longitude,
          suggestion.lng,
          suggestion.entryLongitude,
          suggestion.entry_lon
        ),
        mainText,
        secondaryText,
      });
    })
    .filter((prediction: OlaPlacePrediction) => Boolean(prediction.description));
}

async function nominatimAutocomplete(input: string): Promise<OlaPlacePrediction[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'in');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', input);

  const payload = await fetchJson<any[]>(url.toString(), 'nominatim');

  return payload.map(result =>
    buildPrediction('nominatim', result.display_name, `nominatim:${result.place_id}`, {
      lat: asNumber(result.lat),
      lng: asNumber(result.lon),
      mainText: result.name ?? result.display_name?.split(',')[0],
      secondaryText: result.display_name,
    })
  );
}

async function olaPlaceDetailsOnly(placeId: string): Promise<OlaPlaceDetails | null> {
  const payload = await fetchJson<any>(
    olaUrl('/places/v1/details', { place_id: placeId }),
    'ola'
  );

  return normalizeDetails(
    'ola',
    normalizeAddress(payload?.result?.formatted_address),
    asNumber(payload?.result?.geometry?.location?.lat),
    asNumber(payload?.result?.geometry?.location?.lng)
  );
}

async function olaGeocodeOnly(address: string): Promise<OlaPlaceDetails | null> {
  const payload = await fetchJson<any>(
    olaUrl('/places/v1/geocode', { address }),
    'ola'
  );
  const firstResult = payload?.geocodingResults?.[0];

  return normalizeDetails(
    'ola',
    normalizeAddress(firstResult?.formatted_address, address),
    asNumber(firstResult?.geometry?.location?.lat),
    asNumber(firstResult?.geometry?.location?.lng)
  );
}

async function mapplsGeocodeOnly(address: string): Promise<OlaPlaceDetails | null> {
  const payload = await fetchJson<any>(
    mapplsUrl('search', '/search/address/geocode', { address }),
    'mappls'
  );
  const firstResult = Array.isArray(payload?.copResults)
    ? payload.copResults[0]
    : Array.isArray(payload?.results)
      ? payload.results[0]
      : Array.isArray(payload)
        ? payload[0]
        : payload;

  return normalizeDetails(
    'mappls',
    normalizeAddress(
      firstResult?.formatted_address,
      firstResult?.placeName,
      firstResult?.placeAddress,
      address
    ),
    asNumber(
      firstResult?.latitude,
      firstResult?.lat,
      firstResult?.entryLatitude,
      firstResult?.entry_lat
    ),
    asNumber(
      firstResult?.longitude,
      firstResult?.lng,
      firstResult?.entryLongitude,
      firstResult?.entry_lon
    )
  );
}

async function nominatimGeocodeOnly(address: string): Promise<OlaPlaceDetails | null> {
  const matches = await nominatimAutocomplete(address);
  const first = matches[0];
  if (!first || first.lat == null || first.lng == null) return null;

  return {
    address: first.description,
    lat: first.lat,
    lng: first.lng,
    provider: 'nominatim',
  };
}

async function olaDirectionsOnly(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const payload = await fetchJson<any>(
    olaUrl('/routing/v1/directions', {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
    }),
    'ola'
  );

  const polyline = payload?.routes?.[0]?.overview_polyline?.points;
  return polyline ? { polyline, provider: 'ola' } : null;
}

async function mapplsDirectionsOnly(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const path = `/route/direction/route_adv/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const payload = await fetchJson<any>(
    mapplsUrl('route', path, { geometries: 'polyline' }),
    'mappls'
  );

  const firstRoute = payload?.routes?.[0];
  const polyline =
    firstRoute?.geometry ??
    firstRoute?.overview_polyline?.points ??
    firstRoute?.overview_polyline;

  return polyline ? { polyline, provider: 'mappls' } : null;
}

async function osrmDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  );
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'polyline');

  const payload = await fetchJson<any>(url.toString(), 'osrm');
  const polyline = payload?.routes?.[0]?.geometry;

  return polyline ? { polyline, provider: 'osrm' } : null;
}

export async function olaAutocomplete(input: string): Promise<OlaPlacePrediction[]> {
  const query = input.trim();
  if (!query) return [];

  const errors: OlaMapsApiError[] = [];

  if (isOlaMapsConfigured()) {
    try {
      const results = await olaAutocompleteOnly(query);
      if (results.length > 0) return results;
    } catch (error) {
      errors.push(
        error instanceof OlaMapsApiError
          ? error
          : new OlaMapsApiError('Ola suggestions failed.', 0, 'ola')
      );
    }
  }

  if (isMapplsConfigured()) {
    try {
      const results = await mapplsAutocompleteOnly(query);
      if (results.length > 0) return results;
    } catch (error) {
      errors.push(
        error instanceof OlaMapsApiError
          ? error
          : new OlaMapsApiError('Mappls suggestions failed.', 0, 'mappls')
      );
    }
  }

  try {
    return await nominatimAutocomplete(query);
  } catch (error) {
    errors.push(
      error instanceof OlaMapsApiError
        ? error
        : new OlaMapsApiError('OpenStreetMap suggestions failed.', 0, 'nominatim')
    );
  }

  throw new LocationSearchError(errors);
}

// Every provider in the search chain failed. Holds each provider's own error, in the order tried.
export class LocationSearchError extends Error {
  failures: OlaMapsApiError[];

  constructor(failures: OlaMapsApiError[]) {
    super(describeSearchFailures(failures));
    this.name = 'LocationSearchError';
    this.failures = failures;
  }
}

const providerNames: Record<FleetMapProvider | 'unknown', string> = {
  ola: 'Ola Maps',
  mappls: 'Mappls',
  nominatim: 'OpenStreetMap',
  osrm: 'OSRM',
  leaflet: 'Leaflet',
  unknown: 'Map search',
};

function describeFailure(error: OlaMapsApiError): string {
  const name = providerNames[error.provider];
  if (error.status === 401 || error.status === 403) return `${name} refused this site (${error.status})`;
  if (error.status === 429) return `${name} is limiting requests (429)`;
  if (error.status >= 500) return `${name} is down (${error.status})`;
  if (error.status === 0) return `${name} could not be reached`;
  return `${name} failed (${error.status})`;
}

// "Address search is unavailable: Ola Maps refused this site (403), Mappls is down (503)."
export function describeSearchFailures(failures: OlaMapsApiError[]): string {
  if (failures.length === 0) return 'Address search is unavailable.';
  return `Address search is unavailable: ${failures.map(describeFailure).join(', ')}.`;
}

export async function olaPlaceDetails(
  placeId: string,
  fallbackDescription = ''
): Promise<OlaPlaceDetails | null> {
  const normalizedPlaceId = placeId.trim();
  if (!normalizedPlaceId) return null;

  if (normalizedPlaceId.startsWith('mappls:')) {
    return fallbackDescription ? olaGeocode(fallbackDescription) : null;
  }

  if (normalizedPlaceId.startsWith('nominatim:')) {
    return fallbackDescription ? olaGeocode(fallbackDescription) : null;
  }

  if (isOlaMapsConfigured()) {
    try {
      const details = await olaPlaceDetailsOnly(normalizedPlaceId);
      if (details) return details;
    } catch {
      // Fall through to the broader geocoder chain.
    }
  }

  return fallbackDescription ? olaGeocode(fallbackDescription) : null;
}

// Addresses already looked up this session, so editing the drop doesn't geocode the pickup again.
// Misses are not kept: a provider that was down a minute ago may answer now.
const geocodeCache = new Map<string, Promise<OlaPlaceDetails | null>>();
const GEOCODE_CACHE_LIMIT = 200;
const MIN_GEOCODE_LENGTH = 3;

export function olaGeocode(address: string): Promise<OlaPlaceDetails | null> {
  const query = address.trim();
  if (query.length < MIN_GEOCODE_LENGTH) return Promise.resolve(null);

  const key = query.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  if (geocodeCache.size >= GEOCODE_CACHE_LIMIT) {
    geocodeCache.delete(geocodeCache.keys().next().value!);
  }
  const lookup = geocodeAcrossProviders(query).then(details => {
    if (!details) geocodeCache.delete(key);
    return details;
  });
  geocodeCache.set(key, lookup);
  return lookup;
}

async function geocodeAcrossProviders(query: string): Promise<OlaPlaceDetails | null> {
  if (isOlaMapsConfigured()) {
    try {
      const details = await olaGeocodeOnly(query);
      if (details) return details;
    } catch {
      // Fall through to the next provider.
    }
  }

  if (isMapplsConfigured()) {
    try {
      const details = await mapplsGeocodeOnly(query);
      if (details) return details;
    } catch {
      // Fall through to the open fallback.
    }
  }

  try {
    return await nominatimGeocodeOnly(query);
  } catch {
    return null;
  }
}

export async function olaDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult | null> {
  if (isOlaMapsConfigured()) {
    try {
      const route = await olaDirectionsOnly(origin, destination);
      if (route) return route;
    } catch {
      // Fall through to the next provider.
    }
  }

  if (isMapplsConfigured()) {
    try {
      const route = await mapplsDirectionsOnly(origin, destination);
      if (route) return route;
    } catch {
      // Fall through to the open fallback.
    }
  }

  try {
    return await osrmDirections(origin, destination);
  } catch {
    return null;
  }
}

export interface OlaMarkerOptions {
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  element?: HTMLElement;
}

interface UseOlaMapsResult {
  addMarker: (options: OlaMarkerOptions) => any | null;
  containerRef: RefObject<HTMLDivElement>;
  drawRoute: (polyline: string, options?: string | RouteDrawOptions) => string | null;
  error: string | null;
  fitBounds: (coords: [number, number][], padding?: number) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  isLoaded: boolean;
  mapInstance: any | null;
  providerLabel: string;
  removeRoute: (layerId: string) => void;
}

export function useOlaMaps(
  defaultCenter: { lat: number; lng: number } = { lat: 26.9124, lng: 75.7873 },
  defaultZoom = 11
): UseOlaMapsResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const routeCountRef = useRef(0);
  const routeLayersRef = useRef(new Map<string, any>());

  useEffect(() => {
    let map: any;
    let isCancelled = false;

    loadLeaflet()
      .then(() => {
        if (isCancelled || !containerRef.current || !window.L) return;

        const L = window.L;
        map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
        });

        L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.control
          .attribution({ position: 'bottomleft', prefix: false })
          .addTo(map)
          .addAttribution(OSM_ATTRIBUTION);

        map.setView([defaultCenter.lat, defaultCenter.lng], defaultZoom);
        map.whenReady(() => {
          if (isCancelled) return;
          setMapInstance(map);
          setIsLoaded(true);
          setError(null);
          window.setTimeout(() => map.invalidateSize?.(), 120);
        });
      })
      .catch((loadError: Error) => {
        if (!isCancelled) setError(loadError.message);
      });

    return () => {
      isCancelled = true;
      routeLayersRef.current.forEach(layer => {
        try {
          layer?.remove?.();
        } catch {
          // Ignore cleanup failures from a half-initialized map.
        }
      });
      routeLayersRef.current.clear();

      try {
        map?.remove?.();
      } catch {
        // Ignore cleanup failures.
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstance || !isLoaded) return;
    mapInstance.setView([defaultCenter.lat, defaultCenter.lng], defaultZoom, { animate: false });
  }, [defaultCenter.lat, defaultCenter.lng, defaultZoom, isLoaded, mapInstance]);

  const addMarker = useCallback(
    (options: OlaMarkerOptions): any | null => {
      if (!mapInstance || !window.L) return null;

      const L = window.L;
      const markerHtml = options.element?.outerHTML ?? `
        <div style="
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: ${options.color ?? '#2563eb'};
          border: 3px solid rgba(255,255,255,0.95);
          box-shadow: 0 8px 18px rgba(15,23,42,0.22);
        "></div>
      `;

      const marker = L.marker([options.lat, options.lng], {
        icon: L.divIcon({
          html: markerHtml,
          className: 'fleetos-map-marker',
          iconSize: options.element ? [44, 44] : [24, 24],
          iconAnchor: options.element ? [22, 22] : [12, 12],
          popupAnchor: [0, -18],
        }),
      }).addTo(mapInstance);

      if (options.label) {
        marker.bindPopup(options.label, {
          closeButton: false,
          offset: [0, -18],
        });
      }

      return marker;
    },
    [mapInstance]
  );

  const drawRoute = useCallback(
    (polyline: string, options: string | RouteDrawOptions = '#2563eb'): string | null => {
      if (!mapInstance || !isLoaded || !window.L) return null;

      const L = window.L;
      const layerId = `route-${++routeCountRef.current}`;
      const latLngs = decodePolyline(polyline).map(([lng, lat]) => [lat, lng]);
      const routeStyle =
        typeof options === 'string'
          ? { color: options, weight: 5, opacity: 0.84 }
          : {
              color: options.color ?? '#2563eb',
              weight: options.weight ?? 5,
              opacity: options.opacity ?? 0.84,
            };
      const routeLayer = L.polyline(latLngs, {
        color: routeStyle.color,
        weight: routeStyle.weight,
        opacity: routeStyle.opacity,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapInstance);

      routeLayersRef.current.set(layerId, routeLayer);
      return layerId;
    },
    [isLoaded, mapInstance]
  );

  const removeRoute = useCallback(
    (layerId: string) => {
      const routeLayer = routeLayersRef.current.get(layerId);
      if (!routeLayer) return;

      try {
        routeLayer.remove();
      } catch {
        // Ignore cleanup failures when the map is already gone.
      }

      routeLayersRef.current.delete(layerId);
    },
    []
  );

  const fitBounds = useCallback(
    (coords: [number, number][], padding = 60) => {
      if (!mapInstance || !window.L || coords.length === 0) return;

      const L = window.L;
      const latLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));

      if (latLngs.length === 1) {
        mapInstance.flyTo(latLngs[0], Math.max(mapInstance.getZoom?.() ?? defaultZoom, 14));
        return;
      }

      mapInstance.fitBounds(L.latLngBounds(latLngs), { padding: [padding, padding] });
    },
    [defaultZoom, mapInstance]
  );

  const flyTo = useCallback(
    (lat: number, lng: number, zoom = 14) => {
      mapInstance?.flyTo?.([lat, lng], zoom);
    },
    [mapInstance]
  );

  return {
    addMarker,
    containerRef,
    drawRoute,
    error,
    fitBounds,
    flyTo,
    isLoaded,
    mapInstance,
    providerLabel: getMapStackLabel(),
    removeRoute,
  };
}

export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e5, lat / 1e5]);
  }

  return coords;
}

export function estimatePolylineDistanceKm(encoded: string): number {
  const coordinates = decodePolyline(encoded);
  if (coordinates.length < 2) return 0;

  const toRad = (value: number) => (value * Math.PI) / 180;
  let meters = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const [prevLng, prevLat] = coordinates[index - 1];
    const [nextLng, nextLat] = coordinates[index];
    const dLat = toRad(nextLat - prevLat);
    const dLng = toRad(nextLng - prevLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(prevLat)) *
        Math.cos(toRad(nextLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    meters += 6371000 * c;
  }

  return meters / 1000;
}
