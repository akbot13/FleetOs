// Converting driver_cash_entries rows to the driver app's cash types. Kept apart from
// useDriverCash so it can be tested without a database connection.
import type { Tables } from '@/integrations/supabase/types';
import type { CashCollection, ExpenseEntry } from './types';

type CashEntryRow = Pick<Tables<'driver_cash_entries'>,
  'id' | 'kind' | 'category' | 'method' | 'label' | 'amount' | 'note' | 'booking_id' | 'created_at'>;

export const toBookingId = (tripId?: string) => (tripId && /^\d+$/.test(tripId) ? Number(tripId) : null);

export function rowToExpense(r: CashEntryRow): ExpenseEntry {
  return {
    id: `db_${r.id}`, type: (r.category ?? 'other') as ExpenseEntry['type'], amount: Number(r.amount),
    note: r.note ?? '', tripId: r.booking_id ? String(r.booking_id) : undefined, timestamp: r.created_at, isOffline: false,
  };
}

export function rowToCollection(r: CashEntryRow): CashCollection {
  return {
    id: `db_${r.id}`, tripId: r.booking_id ? String(r.booking_id) : '', customerName: r.label ?? '',
    amount: Number(r.amount), method: r.method === 'upi' ? 'upi' : 'cash', note: r.note ?? undefined,
    timestamp: r.created_at, isOffline: false,
  };
}
