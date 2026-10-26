// ─── TYPES ───────────────────────────────────────────────────────────────────

export type DriverScreen = 'home' | 'active-trip' | 'earnings' | 'documents' | 'expenses';
export type TripPhase = 'navigating' | 'arrived' | 'started' | 'completed';

export interface ScheduledTrip {
  id: string;
  customerName: string;
  customerPhone: string;
  pickup: string;
  drop: string;
  fare: number;
  distance: string;
  scheduledAt: string;
  notes: string;
  tripType: 'city' | 'airport' | 'outstation' | 'sightseeing';
  status: 'pending_confirm' | 'confirmed' | 'active';
}

export interface ExpenseEntry {
  id: string;
  type: 'fuel_petrol' | 'fuel_cng' | 'toll' | 'parking' | 'other';
  amount: number;
  note: string;
  tripId?: string;
  timestamp: string;
  isOffline: boolean;
}

export interface CashCollection {
  id: string;
  tripId: string;
  customerName: string;
  amount: number;
  method: 'cash' | 'upi';
  note?: string;
  timestamp: string;
  isOffline: boolean;
}

export interface MockTrip {
  id: string;
  customerName: string;
  customerPhone: string;
  pickup: string;
  drop: string;
  fare: number;
  distance: string;
  notes?: string;
  tripType: string;
  eta: string;
}
