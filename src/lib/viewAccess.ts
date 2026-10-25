export type AppView = 'customer' | 'admin' | 'driver' | 'pricing';

type DriverSessionSnapshot = {
  id?: number;
  status?: string | null;
};

export function normalizeAppView(value: string | null | undefined): AppView {
  if (value === 'admin' || value === 'driver' || value === 'pricing') {
    return value;
  }
  return 'customer';
}

export function hasApprovedDriverSession() {
  if (typeof window === 'undefined') return false;

  const rawDriver = localStorage.getItem('fleetos_driver');
  const rawScreen = localStorage.getItem('fleetos_driver_screen');
  if (!rawDriver || !rawScreen) return false;

  try {
    const parsed = JSON.parse(rawDriver) as DriverSessionSnapshot;
    return rawScreen === 'app' && (parsed.status === 'free' || parsed.status === 'on-trip');
  } catch {
    return false;
  }
}

