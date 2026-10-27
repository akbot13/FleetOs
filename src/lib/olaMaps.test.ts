import { describe, it, expect, vi, afterEach } from 'vitest';
import { OlaMapsApiError, describeSearchFailures, olaGeocode } from './olaMaps';

describe('describeSearchFailures', () => {
  it('names every provider that failed and how', () => {
    expect(describeSearchFailures([
      new OlaMapsApiError('Domain is not allowed.', 403, 'ola'),
      new OlaMapsApiError('Service unavailable', 503, 'mappls'),
      new OlaMapsApiError('Failed to fetch', 0, 'nominatim'),
    ])).toBe(
      'Address search is unavailable: Ola Maps refused this site (403), Mappls is down (503), OpenStreetMap could not be reached.'
    );
  });

  it('reports rate limiting separately', () => {
    expect(describeSearchFailures([new OlaMapsApiError('', 429, 'nominatim')]))
      .toBe('Address search is unavailable: OpenStreetMap is limiting requests (429).');
  });
});

// No map keys are set in tests, so olaGeocode goes straight to OpenStreetMap.
describe('olaGeocode', () => {
  afterEach(() => vi.unstubAllGlobals());

  const found = () => new Response(JSON.stringify([
    { place_id: 1, display_name: 'Jaipur Junction, Jaipur', name: 'Jaipur Junction', lat: '26.92', lon: '75.79' },
  ]), { status: 200 });

  it('looks each address up once', async () => {
    const fetchMock = vi.fn(async () => found());
    vi.stubGlobal('fetch', fetchMock);

    const first = await olaGeocode('Jaipur Junction');
    const again = await olaGeocode('  jaipur junction ');

    expect(first).toEqual(again);
    expect(first?.lat).toBe(26.92);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed lookup', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await olaGeocode('Sindhi Camp')).toBeNull();
    expect(await olaGeocode('Sindhi Camp')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips addresses too short to place', async () => {
    const fetchMock = vi.fn(async () => found());
    vi.stubGlobal('fetch', fetchMock);

    expect(await olaGeocode('Ja')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
