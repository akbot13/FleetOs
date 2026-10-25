import { summarizeCash, formatSignedRupees } from '@/lib/cash';
import { useState } from 'react';
import { Fuel, IndianRupee, WifiOff, Wifi, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ExpenseEntry, CashCollection } from './types';
import { EXPENSE_LABELS } from './helpers';

// ─── EXPENSE TRACKER ──────────────────────────────────────────────────────────

export function ExpenseTracker({
  isOffline, expenses, collections,
  onAddExpense, onAddCollection, onDeleteExpense,
  todayHandover, onHandOver, handoverLoading,
}: {
  isOffline: boolean;
  expenses: ExpenseEntry[];
  collections: CashCollection[];
  onAddExpense: (e: Omit<ExpenseEntry, 'id' | 'timestamp' | 'isOffline'>) => void;
  onAddCollection: (c: Omit<CashCollection, 'id' | 'timestamp' | 'isOffline'>) => void;
  onDeleteExpense: (id: string) => void;
  todayHandover: { amount: number; handed_over_at: string } | null;
  onHandOver: (amount: number) => Promise<void>;
  handoverLoading: boolean;
}) {
  const [addingExpense, setAddingExpense] = useState(false);
  const [addingCollection, setAddingCollection] = useState(false);
  const [expType, setExpType] = useState<ExpenseEntry['type']>('fuel_cng');
  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');
  const [colAmount, setColAmount] = useState('');
  const [colNote, setColNote] = useState('');
  const [colMethod, setColMethod] = useState<'cash' | 'upi'>('cash');

  const { totalExpenses, totalCollected, cashToHandOver, netEarnings } = summarizeCash(expenses, collections);
  const pendingSync = [...expenses, ...collections].filter(e => e.isOffline).length;

  const submitExpense = () => {
    if (!expAmount) return;
    onAddExpense({ type: expType, amount: +expAmount, note: expNote });
    setExpAmount(''); setExpNote(''); setAddingExpense(false);
  };

  const submitCollection = () => {
    if (!colAmount) return;
    onAddCollection({ tripId: 'manual', customerName: '', amount: +colAmount, method: colMethod, note: colNote });
    setColAmount(''); setColNote(''); setAddingCollection(false);
  };

  return (
    <div className="space-y-4 pb-24">
      {isOffline && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30">
          <WifiOff className="h-4 w-4 text-orange-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-300">You're offline</p>
            <p className="text-xs text-orange-400/70">All entries saved locally — will sync when online</p>
          </div>
          {pendingSync > 0 && <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full font-bold">{pendingSync} pending</span>}
        </div>
      )}
      {!isOffline && pendingSync > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-green-500/10 border border-green-500/30">
          <Wifi className="h-4 w-4 text-green-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-green-300">Back online</p>
            <p className="text-xs text-green-400/70">Syncing {pendingSync} offline entries...</p>
          </div>
          <div className="h-4 w-4 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
        </div>
      )}
      <Card className="p-4 bg-gray-900 border-gray-800">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Today's Summary</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="text-lg font-black text-green-400">₹{totalCollected.toLocaleString()}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Collected</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="text-lg font-black text-red-400">₹{totalExpenses.toLocaleString()}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Spent</div>
          </div>
          <div className={`text-center p-3 rounded-xl border ${netEarnings >= 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
            <div className={`text-lg font-black ${netEarnings >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{formatSignedRupees(netEarnings)}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Net</div>
          </div>
        </div>
      </Card>
      <Card className="p-4 bg-gray-900 border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white flex items-center gap-2"><IndianRupee className="h-4 w-4 text-green-400" /> Cash Collections</div>
          <button onClick={() => setAddingCollection(!addingCollection)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 font-semibold active:scale-95 transition-all">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {addingCollection && (
          <div className="mb-3 p-3 rounded-xl bg-gray-800 border border-gray-700 space-y-2.5">
            <input type="number" className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white text-sm placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-green-500" placeholder="Amount (₹)" value={colAmount} onChange={e => setColAmount(e.target.value)} />
            <input className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white text-sm placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-green-500" placeholder="Note (optional)" value={colNote} onChange={e => setColNote(e.target.value)} />
            <div className="flex gap-2">
              {(['cash', 'upi'] as const).map(m => (
                <button key={m} onClick={() => setColMethod(m)} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${colMethod === m ? 'bg-green-500 border-green-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}>
                  {m === 'cash' ? '💵 Cash' : '📱 UPI'}
                </button>
              ))}
            </div>
            <button onClick={submitCollection} className="w-full py-2.5 rounded-lg bg-green-500 text-white text-sm font-bold active:scale-95 transition-all">Save Collection</button>
          </div>
        )}
        <div className="space-y-2">
          {collections.length === 0 && <p className="text-xs text-gray-500 text-center py-3">No collections yet today</p>}
          {collections.map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div>
                <div className="text-sm font-semibold text-white">{c.note ? c.note : 'Cash collected'}</div>
                <div className="text-xs text-gray-400">{c.method === 'cash' ? '💵 Cash' : '📱 UPI'} · {new Date(c.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div className="flex items-center gap-2">
                {c.isOffline && <WifiOff className="h-3 w-3 text-orange-400" />}
                <span className="text-sm font-bold text-green-400">+₹{c.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4 bg-gray-900 border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white flex items-center gap-2"><Fuel className="h-4 w-4 text-orange-400" /> Expenses</div>
          <button onClick={() => setAddingExpense(!addingExpense)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold active:scale-95 transition-all">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {addingExpense && (
          <div className="mb-3 p-3 rounded-xl bg-gray-800 border border-gray-700 space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(EXPENSE_LABELS) as ExpenseEntry['type'][]).map(t => (
                <button key={t} onClick={() => setExpType(t)} className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition-all text-center ${expType === t ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}>
                  {EXPENSE_LABELS[t]}
                </button>
              ))}
            </div>
            <input type="number" className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white text-sm placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-orange-500" placeholder="Amount (₹)" value={expAmount} onChange={e => setExpAmount(e.target.value)} />
            <input className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white text-sm placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-orange-500" placeholder="Note (optional)" value={expNote} onChange={e => setExpNote(e.target.value)} />
            <button onClick={submitExpense} className="w-full py-2.5 rounded-lg bg-orange-500 text-white text-sm font-bold active:scale-95 transition-all">Save Expense</button>
          </div>
        )}
        <div className="space-y-2">
          {expenses.length === 0 && <p className="text-xs text-gray-500 text-center py-3">No expenses logged today</p>}
          {expenses.map(e => (
            <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div>
                <div className="text-sm font-semibold text-white">{EXPENSE_LABELS[e.type]}{e.note ? ` · ${e.note}` : ''}</div>
                <div className="text-xs text-gray-400">{new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div className="flex items-center gap-2">
                {e.isOffline && <WifiOff className="h-3 w-3 text-orange-400" />}
                <span className="text-sm font-bold text-red-400">-₹{e.amount}</span>
                <button onClick={() => onDeleteExpense(e.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4 bg-gray-900 border-gray-800">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cash Handover</div>
        <p className="text-2xl font-black text-white mb-1">₹{Math.max(0, cashToHandOver).toLocaleString('en-IN')}</p>
        <p className="text-xs text-gray-500 mb-3">cash to hand over to Anil today</p>
        {cashToHandOver > 0 && !todayHandover && (
          <button onClick={() => onHandOver(cashToHandOver)} disabled={handoverLoading} className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white font-bold text-sm disabled:opacity-50">
            {handoverLoading ? 'Recording...' : 'Mark as Handed Over to Anil'}
          </button>
        )}
        {todayHandover && (
          <p className="text-xs text-green-400 font-medium">
            ✓ Recorded at {new Date(todayHandover.handed_over_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
        )}
      </Card>
    </div>
  );
}
