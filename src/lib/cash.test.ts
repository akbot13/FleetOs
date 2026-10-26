import { describe, it, expect } from 'vitest';
import { summarizeCash, formatSignedRupees } from './cash';
import { toBookingId, rowToCollection, rowToExpense } from '@/components/driver/useDriverCash';

describe('summarizeCash', () => {
  it('hands over cash only, minus what the driver spent', () => {
    const s = summarizeCash(
      [{ amount: 200 }, { amount: 50.5 }],
      [{ amount: 480, method: 'cash' }, { amount: 300, method: 'upi' }],
    );
    expect(s).toEqual({
      totalExpenses: 250.5,
      totalCollected: 780,
      totalCashCollected: 480,
      cashToHandOver: 229.5,
      netEarnings: 529.5,
    });
  });

  it('avoids floating-point drift on paise', () => {
    expect(summarizeCash([{ amount: 0.1 }, { amount: 0.2 }], []).totalExpenses).toBe(0.3);
  });

  it('shows a loss with a minus sign', () => {
    expect(formatSignedRupees(-1)).toBe('-₹1');
    expect(formatSignedRupees(1500)).toBe('₹1,500');
  });
});

describe('driver cash rows', () => {
  const base = { id: 7, kind: 'expense', category: 'toll', method: null, label: null, amount: 40, note: 'NH48', booking_id: 54, created_at: '2026-10-25T09:00:00Z' };

  it('maps a saved expense back to the app shape', () => {
    expect(rowToExpense(base)).toEqual({
      id: 'db_7', type: 'toll', amount: 40, note: 'NH48', tripId: '54', timestamp: '2026-10-25T09:00:00Z', isOffline: false,
    });
  });

  it('maps a saved collection, defaulting an unknown method to cash', () => {
    const row = { ...base, kind: 'collection', category: null, method: 'card', label: 'Priya', booking_id: null };
    expect(rowToCollection(row)).toMatchObject({ id: 'db_7', tripId: '', customerName: 'Priya', method: 'cash', amount: 40 });
  });

  it('only links numeric trip ids to bookings', () => {
    expect(toBookingId('54')).toBe(54);
    expect(toBookingId('demo')).toBeNull();
    expect(toBookingId(undefined)).toBeNull();
  });
});
