import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { CashCollection, ExpenseEntry } from './types';
import { rowToCollection, rowToExpense, toBookingId } from './cashRows';

// The driver's money for today: expenses and collections (saved to driver_cash_entries) and the
// cash handover. An entry stays marked isOffline until the database has it, so the pending
// count shows what didn't upload.
export function useDriverCash(driverId: number | undefined, orgId: string | undefined, onHandoverSaved: () => void) {
  const queryClient = useQueryClient();
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [collections, setCollections] = useState<CashCollection[]>([]);
  const [handoverLoading, setHandoverLoading] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    supabase
      .from('driver_cash_entries')
      .select('id, kind, category, method, label, amount, note, booking_id, created_at')
      .eq('driver_id', driverId)
      .gte('created_at', start.toISOString())
      .order('created_at')
      .then(({ data }) => {
        if (!data) return;
        setExpenses(data.filter(r => r.kind === 'expense').map(rowToExpense));
        setCollections(data.filter(r => r.kind === 'collection').map(rowToCollection));
      });
  }, [driverId]);

  const saveCashEntry = async (row: Omit<TablesInsert<'driver_cash_entries'>, 'org_id' | 'driver_id'>) => {
    if (!driverId || !orgId) return null;
    const { data, error } = await supabase
      .from('driver_cash_entries')
      .insert({ org_id: orgId, driver_id: driverId, ...row })
      .select('id')
      .single();
    return error ? null : data;
  };

  const addExpense = async (e: Omit<ExpenseEntry, 'id' | 'timestamp' | 'isOffline'>) => {
    const localId = `exp_${Date.now()}`;
    setExpenses(prev => [...prev, { ...e, id: localId, timestamp: new Date().toISOString(), isOffline: true }]);
    const saved = await saveCashEntry({ kind: 'expense', category: e.type, amount: e.amount, note: e.note || null, booking_id: toBookingId(e.tripId) });
    if (saved) setExpenses(prev => prev.map(x => (x.id === localId ? { ...x, id: `db_${saved.id}`, isOffline: false } : x)));
    else toast.error("Expense kept on this phone only. It wasn't uploaded.");
  };

  const addCollection = async (c: Omit<CashCollection, 'id' | 'timestamp' | 'isOffline'>) => {
    const localId = `col_${Date.now()}`;
    setCollections(prev => [...prev, { ...c, id: localId, timestamp: new Date().toISOString(), isOffline: true }]);
    const saved = await saveCashEntry({ kind: 'collection', method: c.method, label: c.customerName || null, amount: c.amount, note: c.note || null, booking_id: toBookingId(c.tripId) });
    if (saved) setCollections(prev => prev.map(x => (x.id === localId ? { ...x, id: `db_${saved.id}`, isOffline: false } : x)));
    else toast.error("Collection kept on this phone only. It wasn't uploaded.");
  };

  const deleteExpense = async (id: string) => {
    if (id.startsWith('db_')) {
      const { error } = await supabase.from('driver_cash_entries').delete().eq('id', Number(id.slice(3)));
      if (error) { toast.error("Couldn't delete that expense. Try again."); return; }
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleHandOver = async (amount: number) => {
    if (!driverId || !orgId) return;
    setHandoverLoading(true);
    const { error } = await supabase
      .from('cash_handovers_v2')
      .insert({ org_id: orgId, driver_id: driverId, amount: Math.round(amount * 100) / 100, handed_over_at: new Date().toISOString() });
    if (error) {
      toast.error("Handover wasn't saved. Check your connection and try again.");
    } else {
      await queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      onHandoverSaved();
    }
    setHandoverLoading(false);
  };

  const pendingSyncCount = [...expenses, ...collections].filter(e => e.isOffline).length;

  return { expenses, collections, addExpense, addCollection, deleteExpense, handleHandOver, handoverLoading, pendingSyncCount };
}
