import { useState, useEffect, useRef } from 'react';
import {
  Car, Navigation, Phone, Clock, MapPin, Camera, FileText,
  CheckCircle, XCircle, X, Power, AlertTriangle, Wallet,
  TrendingUp, BellOff, Fuel, IndianRupee, WifiOff,
  Wifi, ChevronRight, Plus, Trash2, PhoneCall,
  Calendar, AlarmClock, Shield, Zap
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useMyDriverProfile, useTodayHandover, SupabaseBooking, SupabaseDriver } from '@/hooks/useSupabaseData';
import { useOrg } from '@/hooks/useOrg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { olaDirections, olaGeocode, useOlaMaps } from '@/lib/olaMaps';
import { queueFeedbackMessage, queueInvoiceMessage } from '@/lib/customerAutomation';
import { toast } from 'sonner';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type DriverScreen = 'home' | 'active-trip' | 'earnings' | 'documents' | 'expenses';
type TripPhase = 'navigating' | 'arrived' | 'started' | 'completed';

interface ScheduledTrip {
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

interface ExpenseEntry {
  id: string;
  type: 'fuel_petrol' | 'fuel_cng' | 'toll' | 'parking' | 'other';
  amount: number;
  note: string;
  tripId?: string;
  timestamp: string;
  isOffline: boolean;
}

interface CashCollection {
  id: string;
  tripId: string;
  customerName: string;
  amount: number;
  method: 'cash' | 'upi';
  note?: string;
  timestamp: string;
  isOffline: boolean;
}

interface MockTrip {
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

const JAIPUR_CENTER = { lat: 26.9124, lng: 75.7873 };
const PICKUP_FALLBACK = { lat: 26.85, lng: 75.85 };
const DROP_FALLBACK = { lat: 26.95, lng: 75.9 };

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TRIP_TYPE_ICONS: Record<string, string> = {
  city: '🚗', airport: '✈️', outstation: '🛣️', sightseeing: '🏛️',
};

const EXPENSE_LABELS: Record<string, string> = {
  fuel_petrol: '⛽ Petrol',
  fuel_cng: '💨 CNG',
  toll: '🛣️ Toll',
  parking: '🅿️ Parking',
  other: '📝 Other',
};

const documents = [
  { name: 'Driving License', status: 'verified' as const, expiry: '2028-05-15' },
  { name: 'Vehicle RC', status: 'verified' as const, expiry: '2027-11-20' },
  { name: 'Insurance', status: 'expiring' as const, expiry: '2026-04-01' },
  { name: 'Fitness Certificate', status: 'pending' as const, expiry: null },
  { name: 'PAN Card', status: 'verified' as const, expiry: null },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getHoursUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m away`;
  if (mins > 0) return `${mins} min away`;
  return 'Now';
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function metersBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function bookingToActiveTrip(booking: SupabaseBooking): MockTrip {
  return {
    id: `BK-${booking.id}`,
    customerName: booking.customer_name ?? 'Customer',
    customerPhone: booking.customer_phone ?? '',
    pickup: booking.pickup ?? '',
    drop: booking.drop ?? '',
    fare: booking.fare ?? 0,
    distance: 'Live route',
    notes: booking.notes ?? undefined,
    tripType: booking.trip_type ?? 'city',
    eta: getHoursUntil(booking.scheduled_at ?? new Date().toISOString()),
  };
}

function bookingToTrip(b: SupabaseBooking): ScheduledTrip {
  const mappedStatus: ScheduledTrip['status'] =
    b.status === 'in-progress'
      ? 'active'
      : b.status === 'confirmed'
        ? (b.driver_confirmed_at ? 'confirmed' : 'pending_confirm')
        : 'pending_confirm';
  return {
    id: `BK-${b.id}`,
    customerName: b.customer_name ?? 'Customer',
    customerPhone: b.customer_phone ?? '',
    pickup: b.pickup ?? '',
    drop: b.drop ?? '',
    fare: b.fare ?? 0,
    distance: '—',
    scheduledAt: b.scheduled_at ?? new Date().toISOString(),
    notes: b.notes ?? '',
    tripType: (b.trip_type as ScheduledTrip['tripType']) ?? 'city',
    status: mappedStatus,
  };
}

const trackedBookingStatuses = ['pending', 'confirmed', 'in-progress'] as const;

function sortTripsBySchedule(trips: ScheduledTrip[]) {
  return [...trips].sort(
    (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
  );
}

// ─── ALARM COMPONENT ─────────────────────────────────────────────────────────

function TripAlarm({ trip, onConfirm, onDismiss }: {
  trip: ScheduledTrip;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if ('vibrate' in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    let stopped = false;
    const playBeep = () => {
      if (stopped) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = () => { if (!stopped) setTimeout(playBeep, 200); };
    };
    playBeep();
    return () => { stopped = true; ctx.close(); if ('vibrate' in navigator) navigator.vibrate(0); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); onDismiss(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-64 w-64 rounded-full bg-orange-500/20 animate-ping" />
        <div className="absolute h-48 w-48 rounded-full bg-orange-500/30 animate-ping" style={{ animationDelay: '0.2s' }} />
        <div className="relative z-10 bg-gray-900 border-2 border-orange-500 rounded-3xl p-6 mx-6 max-w-sm w-full shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-orange-400 text-xs font-bold uppercase tracking-widest">New Trip Assigned</span>
            </div>
            <span className="text-gray-400 text-xs font-mono">{countdown}s</span>
          </div>
          <div className="h-1 w-full bg-gray-700 rounded-full mb-5">
            <div className="h-1 bg-orange-500 rounded-full transition-all duration-1000" style={{ width: `${(countdown / 30) * 100}%` }} />
          </div>
          <div className="mb-5">
            <div className="text-2xl font-black text-white mb-1">{trip.customerName}</div>
            <div className="text-orange-400 font-bold text-lg mb-3">{TRIP_TYPE_ICONS[trip.tripType]} ₹{trip.fare.toLocaleString()}</div>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Pickup</div><div className="text-sm font-semibold text-white">{trip.pickup}</div></div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Drop</div><div className="text-sm font-semibold text-white">{trip.drop}</div></div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700">
              <div className="text-center flex-1"><div className="text-white font-bold">{formatTime(trip.scheduledAt)}</div><div className="text-gray-400 text-[10px] uppercase tracking-wider">Pickup Time</div></div>
              <div className="text-center flex-1"><div className="text-white font-bold">{trip.distance}</div><div className="text-gray-400 text-[10px] uppercase tracking-wider">Distance</div></div>
              <div className="text-center flex-1"><div className="text-orange-400 font-bold">{getHoursUntil(trip.scheduledAt)}</div><div className="text-gray-400 text-[10px] uppercase tracking-wider">ETA</div></div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 py-4 rounded-2xl kinetic-gradient active:scale-95 transition-all font-display font-black text-white text-xl flex items-center justify-center gap-2 shadow-elevated min-h-[64px]">
              <CheckCircle className="h-5 w-5" /> CONFIRM
            </button>
            <button onClick={onDismiss} className="flex-1 py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 active:scale-95 transition-all font-bold text-gray-300 text-base flex items-center justify-center gap-2">
              <XCircle className="h-5 w-5" /> Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONTACT ACTIONS ────────────────────────────────────────────────────

function ContactActions({
  customerName,
  customerPhone,
}: {
  customerName: string;
  customerPhone: string;
}) {
  const sanitizedPhone = customerPhone.replace(/\D/g, '');

  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={sanitizedPhone ? `tel:${sanitizedPhone}` : undefined}
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
          sanitizedPhone
            ? 'border-blue-500/30 bg-blue-500/15 text-blue-300 active:scale-95'
            : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500'
        }`}
        aria-disabled={!sanitizedPhone}
      >
        <PhoneCall className="h-4 w-4" />
        Call {customerName}
      </a>
      <a
        href={sanitizedPhone ? `https://wa.me/${sanitizedPhone}` : undefined}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
          sanitizedPhone
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 active:scale-95'
            : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500'
        }`}
        aria-disabled={!sanitizedPhone}
      >
        <Phone className="h-4 w-4" />
        WhatsApp
      </a>
    </div>
  );
}

// ─── EXPENSE TRACKER ──────────────────────────────────────────────────────────

function ExpenseTracker({
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

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);
  const totalCashCollected = collections.filter(c => c.method === 'cash').reduce((s, c) => s + c.amount, 0);
  const cashToHandOver = totalCashCollected - totalExpenses;
  const netEarnings = totalCollected - totalExpenses;
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
            <div className={`text-lg font-black ${netEarnings >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>₹{Math.abs(netEarnings).toLocaleString()}</div>
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

// ─── SCHEDULED TRIP CARD ──────────────────────────────────────────────────────

function ScheduledTripCard({ trip, isOffline, onConfirm, onTap }: {
  trip: ScheduledTrip;
  isOffline: boolean;
  onConfirm: (id: string) => void;
  onTap: (trip: ScheduledTrip) => void;
}) {
  const hoursAway = (new Date(trip.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const isUrgent = hoursAway < 2;

  return (
    <Card
      className={`p-4 border cursor-pointer ${isUrgent ? 'border-orange-500/50 bg-orange-500/5' : 'border-gray-700 bg-gray-900'}`}
      onClick={() => onTap(trip)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">{TRIP_TYPE_ICONS[trip.tripType]} {trip.tripType}</div>
          <div className="font-bold text-white">{trip.customerName}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black text-white">₹{trip.fare.toLocaleString()}</div>
          <div className="text-xs text-gray-400">{trip.distance}</div>
        </div>
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" /><span className="text-gray-300 truncate">{trip.pickup}</span></div>
        <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" /><span className="text-gray-300 truncate">{trip.drop}</span></div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs">
          <AlarmClock className={`h-3.5 w-3.5 ${isUrgent ? 'text-orange-400' : 'text-gray-400'}`} />
          <span className={isUrgent ? 'text-orange-300 font-bold' : 'text-gray-400'}>{formatDate(trip.scheduledAt)} · {formatTime(trip.scheduledAt)}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isUrgent ? 'bg-orange-500/20 text-orange-300' : 'bg-gray-700 text-gray-300'}`}>{getHoursUntil(trip.scheduledAt)}</span>
      </div>
      {trip.status === 'pending_confirm' ? (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm(trip.id); }}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <CheckCircle className="h-4 w-4" /> Confirm Trip
          </button>
          {isOffline && <div className="flex items-center gap-1 text-[10px] text-orange-400 px-2"><WifiOff className="h-3 w-3" /><span>Offline·saves locally</span></div>}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm font-bold text-green-300">Confirmed</span>
          {isOffline && <WifiOff className="h-3 w-3 text-orange-400 ml-auto" />}
        </div>
      )}
    </Card>
  );
}

// ─── MAIN DRIVER APP ──────────────────────────────────────────────────────────

function DriverTripMap({
  activeTrip,
  tripPhase,
  driverPosition,
}: {
  activeTrip: MockTrip;
  tripPhase: TripPhase;
  driverPosition: { lat: number; lng: number } | null;
}) {
  const { addMarker, containerRef, drawRoute, error, fitBounds, isLoaded, providerLabel, removeRoute } = useOlaMaps(JAIPUR_CENTER, 12);
  const markersRef = useRef<any[]>([]);
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

interface DriverAppProps { driver?: (Pick<SupabaseDriver,'id'|'name'|'status'> & Partial<SupabaseDriver>) | null }

export function DriverApp({ driver }: DriverAppProps) {
  const [screen, setScreen] = useState<DriverScreen>('home');
  const [activeTrip, setActiveTrip] = useState<MockTrip | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [tripPhase, setTripPhase] = useState<TripPhase>('navigating');
  const [alarmTrip, setAlarmTrip] = useState<ScheduledTrip | null>(null);
  const [scheduledTrips, setScheduledTrips] = useState<ScheduledTrip[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [collections, setCollections] = useState<CashCollection[]>([]);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [collectBookingId, setCollectBookingId] = useState<number | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi'>('cash');
  const [collectLoading, setCollectLoading] = useState(false);
  const [showUpiDetails, setShowUpiDetails] = useState(false);
  const [bannerTrips, setBannerTrips] = useState<string[]>([]);
  const [alarmTrips, setAlarmTrips] = useState<string[]>([]);
  const [detailTrip, setDetailTrip] = useState<ScheduledTrip | null>(null);
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number; updatedAt: string } | null>(null);
  const lastPublishedLocationRef = useRef<{ lat: number; lng: number; publishedAt: number } | null>(null);
  const lastSyncedStatusRef = useRef<string | null>(null);

  const { data: fetchedProfile } = useMyDriverProfile();
  const myProfile = driver ?? fetchedProfile;
  const { data: todayHandover, refetch: refetchTodayHandover } = useTodayHandover(myProfile?.id);
  const queryClient = useQueryClient();
  const { org } = useOrg();

  const { data: realTrips = [] } = useQuery({
    queryKey: ['driver-trips', myProfile?.id, org?.id],
    queryFn: async () => {
      if (!myProfile?.id || !org?.id) return [];
      const { data, error } = await (supabase as any)
        .from('bookings')
        .select('*')
        .eq('org_id', org.id)
        .eq('driver_id', myProfile.id)
        .in('status', [...trackedBookingStatuses])
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return data as SupabaseBooking[];
    },
    enabled: !!myProfile?.id && !!org?.id,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const queryTrips = realTrips.map(bookingToTrip);
  const displayTrips: ScheduledTrip[] = [
    ...queryTrips,
    ...scheduledTrips.filter(localTrip => !queryTrips.some(queryTrip => queryTrip.id === localTrip.id)),
  ];
  const sortedTrips = sortTripsBySchedule(displayTrips);
  const activeBooking = realTrips.find(trip => trip.status === 'in-progress') ?? null;
  const readyBooking = realTrips.find(
    trip => trip.status === 'confirmed' && Boolean(trip.driver_confirmed_at)
  ) ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString();
  const monthKey = todayKey.slice(0, 7);
  const todayRevenue = realTrips
    .filter(trip => trip.payment_confirmed_at?.startsWith(todayKey))
    .reduce((sum, trip) => sum + (trip.amount_collected ?? trip.fare ?? 0), 0);
  const weekRevenue = realTrips
    .filter(trip => trip.payment_confirmed_at && trip.payment_confirmed_at >= weekStartIso)
    .reduce((sum, trip) => sum + (trip.amount_collected ?? trip.fare ?? 0), 0);
  const monthRevenue = realTrips
    .filter(trip => trip.payment_confirmed_at?.startsWith(monthKey))
    .reduce((sum, trip) => sum + (trip.amount_collected ?? trip.fare ?? 0), 0);
  const completedTodayCount = realTrips.filter(trip => trip.trip_completed_at?.startsWith(todayKey)).length;
  const completedWeekCount = realTrips.filter(trip => trip.trip_completed_at && trip.trip_completed_at >= weekStartIso).length;
  const completedMonthCount = realTrips.filter(trip => trip.trip_completed_at?.startsWith(monthKey)).length;
  const acceptanceRate = realTrips.length > 0
    ? Math.round((realTrips.filter(trip => Boolean(trip.driver_confirmed_at)).length / realTrips.length) * 100)
    : 100;
  const gpsStatusLabel = !isOnline
    ? 'Offline'
    : driverPosition
      ? `GPS updated ${formatTime(driverPosition.updatedAt)}`
      : 'Waiting for GPS';

  const checkReminders = () => {
    const now = Date.now();
    const sixHr = 6 * 60 * 60 * 1000;
    const oneHr = 60 * 60 * 1000;
    sortedTrips.forEach(trip => {
      if (trip.status !== 'pending_confirm' && trip.status !== 'confirmed') return;
      const tripTime = new Date(trip.scheduledAt).getTime();
      const msUntil = tripTime - now;
      if (msUntil <= 0) return;
      if (msUntil <= sixHr) {
        const dismissed = localStorage.getItem('dismissed_6hr_' + trip.id);
        if (!dismissed) setBannerTrips(prev => prev.includes(trip.id) ? prev : [...prev, trip.id]);
      }
      if (msUntil <= oneHr) {
        const dismissed = localStorage.getItem('dismissed_1hr_' + trip.id);
        if (!dismissed) setAlarmTrips(prev => prev.includes(trip.id) ? prev : [...prev, trip.id]);
      }
    });
  };

  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [sortedTrips]);

  useEffect(() => {
    if (!myProfile?.id || !org?.id) return;
    const channel = supabase
      .channel('driver-trips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `org_id=eq.${org.id}` },
        (payload) => {
          const nextBooking = payload.eventType === 'DELETE' ? null : payload.new as SupabaseBooking;
          const previousBooking = (payload.old ?? {}) as Partial<SupabaseBooking>;
          const nextDriverId = nextBooking?.driver_id ?? null;
          const previousDriverId = previousBooking.driver_id ?? null;
          const touchesCurrentDriver = nextDriverId === myProfile.id || previousDriverId === myProfile.id;

          if (!touchesCurrentDriver) {
            return;
          }

          if (payload.eventType === 'DELETE') {
            const deletedBooking = payload.old as { id?: number };
            if (deletedBooking?.id != null) {
              setScheduledTrips(prev => prev.filter(trip => trip.id !== `BK-${deletedBooking.id}`));
            }
            return;
          }

          const booking = nextBooking as SupabaseBooking;
          const shouldTrackBooking = booking.driver_id === myProfile.id
            && trackedBookingStatuses.includes(booking.status as (typeof trackedBookingStatuses)[number]);

          if (!shouldTrackBooking) {
            setScheduledTrips(prev => prev.filter(trip => trip.id !== `BK-${booking.id}`));
            queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org.id] });
            return;
          }

          if (shouldTrackBooking) {
            const newTrip = bookingToTrip(booking);
            setScheduledTrips(prev => {
              const others = prev.filter(trip => trip.id !== newTrip.id);
              return sortTripsBySchedule([newTrip, ...others]);
            });

            if (booking.status === 'confirmed' && !booking.driver_confirmed_at) {
              setAlarmTrip(newTrip);
            }
          }

          queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org.id] });
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myProfile?.id, org?.id, queryClient]);

  useEffect(() => {
    if (activeBooking) {
      const nextTrip = bookingToActiveTrip(activeBooking);
      setActiveTrip(prev =>
        prev?.id === nextTrip.id &&
        prev.pickup === nextTrip.pickup &&
        prev.drop === nextTrip.drop &&
        prev.fare === nextTrip.fare &&
        prev.notes === nextTrip.notes
          ? prev
          : nextTrip
      );
      setTripPhase('started');
      return;
    }

    if (!activeTrip && readyBooking) {
      setActiveTrip(bookingToActiveTrip(readyBooking));
      setTripPhase('navigating');
    }
  }, [activeBooking, activeTrip, readyBooking]);

  useEffect(() => {
    if (!myProfile?.id) return;

    const desiredStatus = !isOnline
      ? 'offline'
      : activeBooking
        ? 'on-trip'
        : 'free';

    if (lastSyncedStatusRef.current === desiredStatus) return;
    lastSyncedStatusRef.current = desiredStatus;

    void (supabase as any)
      .from('drivers')
      .update({ status: desiredStatus })
      .eq('id', myProfile.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['drivers'] });
      });
  }, [activeBooking, isOnline, myProfile?.id, queryClient]);

  useEffect(() => {
    if (!myProfile?.id || !isOnline || !navigator.geolocation) return;

    const publishLocation = async (lat: number, lng: number) => {
      setDriverPosition({ lat, lng, updatedAt: new Date().toISOString() });

      const lastPublished = lastPublishedLocationRef.current;
      const movedEnough = !lastPublished
        || metersBetween(lastPublished, { lat, lng }) >= 30;
      const waitedEnough = !lastPublished
        || Date.now() - lastPublished.publishedAt >= 20000;

      if (!movedEnough && !waitedEnough) return;

      lastPublishedLocationRef.current = { lat, lng, publishedAt: Date.now() };
      await (supabase as any)
        .from('drivers')
        .update({
          location_lat: lat,
          location_lng: lng,
        })
        .eq('id', myProfile.id);

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    };

    const watchId = navigator.geolocation.watchPosition(
      position => {
        void publishLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        // Keep the last known location and let the driver continue working.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, myProfile?.id, queryClient]);

  useEffect(() => {
    if (!isOnline) {
      setDriverPosition(null);
    }
  }, [isOnline]);

  const handleConfirmFromAlarm = () => {
    if (!alarmTrip) return;
    setScheduledTrips(trips => trips.map(t => t.id === alarmTrip.id ? { ...t, status: 'confirmed' } : t));
    const bookingId = parseInt(alarmTrip.id.replace('BK-', ''), 10);
    if (!isNaN(bookingId)) handleConfirm(bookingId);
    setAlarmTrip(null);
  };

  const handleConfirmTrip = (id: string) => {
    setScheduledTrips(trips => trips.map(t => t.id === id ? { ...t, status: 'confirmed' } : t));
    const bookingId = parseInt(id.replace('BK-', ''), 10);
    if (!isNaN(bookingId)) handleConfirm(bookingId);
  };

  const handleConfirm = async (bookingId: number) => {
    if (!myProfile?.id) return;
    const db = supabase as any;
    await db.from('bookings').update({ status: 'confirmed', driver_confirmed_at: new Date().toISOString() }).eq('id', bookingId);
    queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org?.id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  const handleStart = async (bookingId: number) => {
    if (!myProfile?.id) return;
    setScheduledTrips(trips => sortTripsBySchedule(
      trips.map(trip => trip.id === `BK-${bookingId}` ? { ...trip, status: 'active' } : trip)
    ));
    await (supabase as any).from('drivers').update({ status: 'on-trip' }).eq('id', myProfile.id);
    await (supabase as any).from('bookings').update({ status: 'in-progress', trip_started_at: new Date().toISOString() }).eq('id', bookingId);
    queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org?.id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  const handleComplete = async (bookingId: number) => {
    if (!myProfile?.id) return;
    setScheduledTrips(trips => trips.filter(trip => trip.id !== `BK-${bookingId}`));
    setBannerTrips(trips => trips.filter(tripId => tripId !== `BK-${bookingId}`));
    setAlarmTrips(trips => trips.filter(tripId => tripId !== `BK-${bookingId}`));
    const db = supabase as any;
    await db.from('bookings').update({ status: 'completed', trip_completed_at: new Date().toISOString() }).eq('id', bookingId);
    await db.from('drivers').update({ status: 'free' }).eq('id', myProfile.id);
    queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile.id, org?.id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    const completedTrip = realTrips.find(t => t.id === bookingId);
    if (completedTrip) {
      await queueFeedbackMessage(completedTrip, org);
    }
    setCollectBookingId(bookingId);
    setCollectAmount(String(completedTrip?.fare ?? ''));
    setCollectMethod(completedTrip?.payment_method === 'upi' ? 'upi' : 'cash');
  };

  const handleLogPayment = async () => {
    if (!collectBookingId) return;
    setCollectLoading(true);
    const paidAmount = Number(collectAmount);
    await (supabase as any).from('bookings').update({
      amount_collected: paidAmount,
      payment_method: collectMethod,
      payment_confirmed_at: new Date().toISOString(),
    }).eq('id', collectBookingId);
    queryClient.invalidateQueries({ queryKey: ['driver-trips', myProfile?.id, org?.id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    const paidTrip = realTrips.find(t => t.id === collectBookingId);
    if (paidTrip) {
      await queueInvoiceMessage(paidTrip, paidAmount, collectMethod, org);
    }
    addCollection({
      tripId: `BK-${collectBookingId}`,
      customerName: paidTrip?.customer_name ?? '',
      amount: paidAmount,
      method: collectMethod,
    });
    setCollectBookingId(null);
    setCollectAmount('');
    setShowUpiDetails(false);
    setActiveTrip(null);
    setScreen('home');
    setTripPhase('navigating');
    setCollectLoading(false);
  };

  // Expenses and collections are saved to driver_cash_entries. An entry stays marked
  // isOffline until the database has it, so the pending count shows what didn't upload.
  const toBookingId = (tripId?: string) => (tripId && /^\d+$/.test(tripId) ? Number(tripId) : null);

  useEffect(() => {
    if (!myProfile?.id) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    (supabase as any)
      .from('driver_cash_entries')
      .select('id, kind, category, method, label, amount, note, booking_id, created_at')
      .eq('driver_id', myProfile.id)
      .gte('created_at', start.toISOString())
      .order('created_at')
      .then(({ data }: { data: any[] | null }) => {
        if (!data) return;
        setExpenses(data.filter(r => r.kind === 'expense').map(r => ({
          id: `db_${r.id}`, type: (r.category ?? 'other') as ExpenseEntry['type'], amount: Number(r.amount),
          note: r.note ?? '', tripId: r.booking_id ? String(r.booking_id) : undefined, timestamp: r.created_at, isOffline: false,
        })));
        setCollections(data.filter(r => r.kind === 'collection').map(r => ({
          id: `db_${r.id}`, tripId: r.booking_id ? String(r.booking_id) : '', customerName: r.label ?? '',
          amount: Number(r.amount), method: r.method === 'upi' ? 'upi' : 'cash', note: r.note ?? undefined,
          timestamp: r.created_at, isOffline: false,
        })));
      });
  }, [myProfile?.id]);

  const saveCashEntry = async (row: Record<string, unknown>) => {
    if (!myProfile || !org) return null;
    const { data, error } = await (supabase as any)
      .from('driver_cash_entries')
      .insert({ org_id: org.id, driver_id: myProfile.id, ...row })
      .select('id')
      .single();
    return error ? null : (data as { id: number });
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
      const { error } = await (supabase as any).from('driver_cash_entries').delete().eq('id', Number(id.slice(3)));
      if (error) { toast.error("Couldn't delete that expense. Try again."); return; }
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleHandOver = async (amount: number) => {
    if (!myProfile || !org) return;
    setHandoverLoading(true);
    const db = supabase as any;
    const { error } = await db
      .from('cash_handovers_v2')
      .insert({ org_id: org.id, driver_id: myProfile.id, amount: Math.round(amount * 100) / 100, handed_over_at: new Date().toISOString() });
    if (error) {
      toast.error("Handover wasn't saved. Check your connection and try again.");
    } else {
      await queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      refetchTodayHandover();
    }
    setHandoverLoading(false);
  };

  const pendingSyncCount = [...expenses, ...collections].filter(e => e.isOffline).length;
  const unconfirmedTrips = sortedTrips.filter(t => t.status === 'pending_confirm').length;


  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="relative min-h-screen bg-gray-950 text-white">

      {/* 6-hour banner reminders */}
      {bannerTrips.map(tripId => {
        const trip = sortedTrips.find(t => t.id === tripId);
        if (!trip) return null;
        return (
          <div key={tripId} className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-700">Trip reminder</p>
              <p className="text-xs text-blue-600">{trip.customerName} · {new Date(trip.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs text-blue-600">{trip.pickup} → {trip.drop}</p>
            </div>
            <button onClick={() => { localStorage.setItem('dismissed_6hr_' + tripId, 'true'); setBannerTrips(prev => prev.filter(id => id !== tripId)); }} className="text-blue-400 hover:text-blue-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {/* 1-hour alarm overlays */}
      {alarmTrips.map(tripId => {
        const trip = sortedTrips.find(t => t.id === tripId);
        if (!trip) return null;
        return (
          <div key={tripId} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="bg-card rounded-2xl p-8 mx-6 max-w-sm w-full text-center">
              <AlarmClock className="h-16 w-16 text-destructive mx-auto mb-4 animate-bounce" />
              <h2 className="text-xl font-bold text-destructive mb-1">TRIP IN 1 HOUR</h2>
              <p className="font-semibold mb-1">{trip.customerName}</p>
              <p className="text-sm text-muted-foreground mb-1">{trip.pickup} → {trip.drop}</p>
              <p className="text-lg font-bold mb-6">₹{trip.fare.toLocaleString('en-IN')}</p>
              <Button className="w-full bg-secondary text-secondary-foreground" onClick={() => { localStorage.setItem('dismissed_1hr_' + tripId, 'true'); setAlarmTrips(prev => prev.filter(id => id !== tripId)); }}>
                Got it, I'm ready
              </Button>
            </div>
          </div>
        );
      })}

      {/* Cash collection modal */}
      {collectBookingId !== null && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="bg-card rounded-2xl p-6 mx-6 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-1">Log payment collected</h2>
            <p className="text-sm text-muted-foreground mb-4">Fare was ₹{realTrips.find(t => t.id === collectBookingId)?.fare?.toLocaleString('en-IN') ?? collectAmount}</p>
            <input type="number" className="w-full border border-border rounded-xl px-4 py-3 text-base mb-4 bg-background focus:outline-none focus:ring-2 focus:ring-ring" value={collectAmount} onChange={e => setCollectAmount(e.target.value)} placeholder="Amount collected" />
            <div className="flex gap-2 mb-5">
              {(['cash', 'upi'] as const).map(m => (
                <button key={m} onClick={() => setCollectMethod(m)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${collectMethod === m ? 'bg-secondary text-secondary-foreground border-secondary' : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'}`}>
                  {m === 'cash' ? '💵 Cash' : '📱 UPI'}
                </button>
              ))}
            </div>
            {collectMethod === 'upi' && (
              <div className="mb-4 space-y-2">
                {(org?.upi_id || org?.upi_qr_url) ? (
                  <button
                    onClick={() => setShowUpiDetails(true)}
                    className="w-full py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold"
                  >
                    Show UPI QR / ID
                  </button>
                ) : (
                  <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    Configure company UPI ID or QR in the organisation settings to enable one-tap UPI collection help.
                  </p>
                )}
              </div>
            )}
            <Button className="w-full" disabled={collectLoading || !collectAmount} onClick={handleLogPayment}>
              {collectLoading ? 'Saving…' : 'Log Payment'}
            </Button>
          </div>
        </div>
      )}

      {showUpiDetails && collectMethod === 'upi' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="bg-card rounded-2xl p-6 mx-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Company UPI</h2>
              <button onClick={() => setShowUpiDetails(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            {org?.upi_qr_url && (
              <img src={org.upi_qr_url} alt="Company UPI QR" className="mx-auto h-56 w-56 rounded-2xl border border-border bg-white object-contain p-3" />
            )}
            {org?.upi_id && (
              <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">UPI ID</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{org.upi_id}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(org.upi_id ?? '')}
                    className="text-xs font-semibold text-secondary"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Show this screen to the customer so they can scan the QR or enter the UPI ID directly.
            </p>
          </div>
        </div>
      )}

      {/* ── Trip Detail Sheet (BUG-05) ── */}
      {detailTrip && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setDetailTrip(null)}
        >
          <div
            className="bg-gray-900 rounded-t-3xl w-full max-w-lg p-6 pb-10 space-y-4"
            style={{ maxHeight: '85vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">{TRIP_TYPE_ICONS[detailTrip.tripType]} {detailTrip.tripType}</div>
                <div className="text-lg font-black text-white">{detailTrip.customerName}</div>
              </div>
              <button onClick={() => setDetailTrip(null)} className="h-9 w-9 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-gray-600 active:scale-95 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4 bg-gray-800 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Pickup</div><div className="text-sm font-semibold text-white">{detailTrip.pickup}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Drop</div><div className="text-sm font-semibold text-white">{detailTrip.drop}</div></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-gray-800 rounded-xl">
                <div className="text-lg font-black text-white">₹{detailTrip.fare.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Fare</div>
              </div>
              <div className="text-center p-3 bg-gray-800 rounded-xl">
                <div className="text-sm font-black text-white">{formatTime(detailTrip.scheduledAt)}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Pickup time</div>
              </div>
              <div className="text-center p-3 bg-gray-800 rounded-xl">
                <div className="text-sm font-black text-orange-400">{getHoursUntil(detailTrip.scheduledAt)}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">ETA</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400 px-1">
              <AlarmClock className="h-4 w-4" />
              <span>{formatDate(detailTrip.scheduledAt)} · {formatTime(detailTrip.scheduledAt)}</span>
            </div>
            {detailTrip.customerPhone && (
              <div className="flex gap-3">
                <a
                  href={`tel:${detailTrip.customerPhone}`}
                  className="flex-1 py-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PhoneCall className="h-4 w-4" /> Call
                </a>
                <a
                  href={`https://wa.me/${detailTrip.customerPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="h-4 w-4" /> WhatsApp
                </a>
              </div>
            )}
            {detailTrip.notes && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-1">Instructions</p>
                <p className="text-sm text-blue-100">{detailTrip.notes}</p>
              </div>
            )}
            <div className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold ${detailTrip.status === 'confirmed' ? 'bg-green-500/10 border border-green-500/20 text-green-300' : 'bg-orange-500/10 border border-orange-500/20 text-orange-300'}`}>
              {detailTrip.status === 'confirmed' ? <><CheckCircle className="h-4 w-4" /> Confirmed</> : <><Clock className="h-4 w-4" /> Awaiting Confirmation</>}
            </div>
            {detailTrip.status === 'confirmed' && (
              <button
                onClick={() => {
                  setActiveTrip({
                    id: detailTrip.id,
                    customerName: detailTrip.customerName,
                    customerPhone: detailTrip.customerPhone,
                    pickup: detailTrip.pickup,
                    drop: detailTrip.drop,
                    fare: detailTrip.fare,
                    distance: detailTrip.distance,
                    notes: detailTrip.notes,
                    tripType: detailTrip.tripType,
                    eta: getHoursUntil(detailTrip.scheduledAt),
                  });
                  setTripPhase('navigating');
                  setScreen('active-trip');
                  setDetailTrip(null);
                }}
                className="w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <Navigation className="h-4 w-4" />
                Start Trip
              </button>
            )}
            <button onClick={() => setDetailTrip(null)} className="w-full py-3 rounded-xl bg-gray-700 text-gray-300 text-sm font-bold active:scale-95 transition-all">
              Close
            </button>
          </div>
        </div>
      )}

      {alarmTrip && (
        <TripAlarm
          trip={alarmTrip}
          onConfirm={handleConfirmFromAlarm}
          onDismiss={() => setAlarmTrip(null)}
        />
      )}

      {/* HEADER */}
      <div className="kinetic-gradient px-5 pt-10 pb-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Zap className="h-3.5 w-3.5 text-white/70" />
                <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">FleetOs</span>
              </div>
              <h1 className="text-xl font-black text-white font-display">{myProfile?.name ?? 'Driver'}</h1>
              <p className="text-xs text-white/60">{myProfile?.plate_number ?? 'Ready'} - {myProfile?.vehicle_model ?? 'Vehicle pending'}</p>
            </div>
            <div className="flex items-center gap-3">
              {!isOnline && pendingSyncCount > 0 && (
                <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 px-2.5 py-1.5 rounded-full">
                  <WifiOff className="h-3 w-3 text-orange-400" />
                  <span className="text-[10px] font-bold text-orange-300">{pendingSyncCount}</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded-full border border-gray-700">
                <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-xs font-bold text-gray-200">{isOnline ? 'Online' : 'Offline'}</span>
                <Switch checked={isOnline} onCheckedChange={setIsOnline} className="scale-75" />
              </div>
              <button
                onClick={async () => {
                  localStorage.removeItem('fleetos_driver');
                  localStorage.removeItem('fleetos_driver_screen');
                  sessionStorage.removeItem('fleetos_trip_phase');
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-full bg-slate-950/80 border border-white/20 text-white text-xs font-bold active:scale-95 transition-all"
              >
                <Power className="h-3.5 w-3.5" /> Log Out
              </button>
            </div>
          </div>
            <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white/15 rounded-xl p-3 text-center"><p className="text-lg font-black text-white font-display">{formatCurrency(todayRevenue)}</p><p className="text-[10px] text-white/60 uppercase tracking-wider">Collected</p></div>
            <div className="bg-white/15 rounded-xl p-3 text-center"><p className="text-lg font-black text-white font-display">{completedTodayCount}</p><p className="text-[10px] text-white/60 uppercase tracking-wider">Completed</p></div>
            <div className="bg-white/15 rounded-xl p-3 text-center"><p className="text-sm font-black text-white font-display">{gpsStatusLabel}</p><p className="text-[10px] text-white/60 uppercase tracking-wider">GPS</p></div>
            </div>
        </div>
      </div>

      {/* TABS */}
      <div className="max-w-lg mx-auto px-5 pt-4">
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { id: 'home' as DriverScreen, label: 'Home', icon: Car, badge: unconfirmedTrips },
            { id: 'active-trip' as DriverScreen, label: 'Active Trip', icon: Navigation, badge: 0 },
            { id: 'expenses' as DriverScreen, label: 'Expenses', icon: Fuel, badge: pendingSyncCount },
            { id: 'earnings' as DriverScreen, label: 'Earnings', icon: Wallet, badge: 0 },
            { id: 'documents' as DriverScreen, label: 'Docs', icon: FileText, badge: 0 },
          ]).map(t => (
            <button key={t.id} onClick={() => setScreen(t.id)} className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${screen === t.id ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-orange-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* HOME */}
        {screen === 'home' && (
          <div className="space-y-4 pb-24">
            {!isOnline && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30">
                <WifiOff className="h-4 w-4 text-orange-400 flex-shrink-0" />
                <div><p className="text-sm font-bold text-orange-300">You're offline</p><p className="text-xs text-orange-400/70">Trip confirmations & expenses save locally</p></div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-white flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-400" /> Upcoming Trips</div>
                {unconfirmedTrips > 0 && <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold">{unconfirmedTrips} need confirmation</span>}
              </div>
              {sortedTrips.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No trips assigned yet</p>
              ) : (
                <div className="space-y-3">
                  {sortedTrips.map(trip => (
                    <ScheduledTripCard key={trip.id} trip={trip} isOffline={!isOnline} onConfirm={handleConfirmTrip} onTap={setDetailTrip} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE TRIP */}
       {screen === 'active-trip' && (
          <div className="space-y-4 pb-24">
            {!activeTrip && (
              <div className="text-center py-16">
                <Navigation className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">No active trip</p>
                <p className="text-xs text-gray-600 mt-1">Start a confirmed trip from Home</p>
              </div>
            )}
            {activeTrip && <Card className="p-4 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-3 text-white">Navigation</h3>
              <div className="h-44 bg-gray-800 rounded-xl mb-3 relative border border-gray-700">
                <DriverTripMap activeTrip={activeTrip} tripPhase={tripPhase} driverPosition={driverPosition} />
                <div className="absolute top-3 left-3 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-bold text-white z-10">
                  <Navigation className="h-3 w-3 inline mr-1 text-blue-400" />
                  {tripPhase === 'navigating' ? 'Head to pickup' : tripPhase === 'arrived' ? 'At pickup location' : tripPhase === 'started' ? 'Heading to drop' : 'Trip closed'}
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-green-500" /><span className="text-gray-200">{activeTrip?.pickup}</span></div>
                <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-gray-200">{activeTrip?.drop}</span></div>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700 mb-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{activeTrip?.customerName}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1"><Shield className="h-3 w-3 text-blue-400" /> Number protected</p>
                  </div>
                  <div className="text-right"><p className="text-lg font-black text-white">{formatCurrency(activeTrip?.fare ?? 0)}</p><p className="text-xs text-gray-400">{activeTrip.distance}</p></div>
                </div>
                {activeTrip?.notes && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-1">Instructions</p>
                    <p className="text-sm text-blue-100">{activeTrip.notes}</p>
                  </div>
                )}
                <ContactActions customerName={activeTrip.customerName} customerPhone={activeTrip.customerPhone} />
              </div>
              {tripPhase === 'navigating' && <button onClick={() => setTripPhase('arrived')} className="w-full py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-95 transition-all text-white font-bold">I've Arrived at Pickup</button>}
{tripPhase === 'arrived' && (
                <div className="space-y-3">
                  {(myProfile as any)?.is_temporary && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                      <p className="text-xs font-bold text-orange-300 mb-2">📸 Odometer photo required</p>
                      <label className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-bold cursor-pointer active:scale-95 transition-all">
                        <Camera className="h-4 w-4" />
                        Take Odometer Photo (Start)
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !myProfile?.id) return;
                            const fileName = `odometer_start_${myProfile.id}_${Date.now()}.jpg`;
                            const { data: uploadData } = await supabase.storage
                              .from('odometer-photos')
                              .upload(fileName, file, { upsert: true });
                            if (uploadData) {
                              const { data: urlData } = supabase.storage
                                .from('odometer-photos')
                                .getPublicUrl(fileName);
                              await (supabase as any).from('drivers').update({ odometer_start_photo: urlData.publicUrl }).eq('id', myProfile.id);
                              toast('Start odometer photo saved ✓');
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setTripPhase('started');
                      const t = sortedTrips.find(t => t.status === 'confirmed');
                      if (t) { const id = parseInt(t.id.replace('BK-', '')); if (!isNaN(id)) handleStart(id); }
                    }}
                    className="w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white font-bold"
                  >
                    Start Trip
                  </button>
                </div>
                )}
{tripPhase === 'started' && (
                <div className="space-y-3">
                  {(myProfile as any)?.is_temporary && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                      <p className="text-xs font-bold text-orange-300 mb-2">📸 Odometer photo required before ending</p>
                      <label className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-bold cursor-pointer active:scale-95 transition-all">
                        <Camera className="h-4 w-4" />
                        Take Odometer Photo (End)
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !myProfile?.id) return;
                            const fileName = `odometer_end_${myProfile.id}_${Date.now()}.jpg`;
                            const { data: uploadData } = await supabase.storage
                              .from('odometer-photos')
                              .upload(fileName, file, { upsert: true });
                            if (uploadData) {
                              const { data: urlData } = supabase.storage
                                .from('odometer-photos')
                                .getPublicUrl(fileName);
                              await (supabase as any).from('drivers').update({ odometer_end_photo: urlData.publicUrl }).eq('id', myProfile.id);
                              toast('End odometer photo saved ✓');
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setTripPhase('completed');
                      const t = sortedTrips.find(t => t.status === 'active');
                      if (t) { const id = parseInt(t.id.replace('BK-', '')); if (!isNaN(id)) handleComplete(id); }
                    }}
                    className="w-full py-3.5 rounded-xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all text-white font-bold"
                  >
                    End Trip · {formatCurrency(activeTrip?.fare ?? 0)}
                  </button>
                </div>
              )}              {tripPhase === 'completed' && (
                <div className="text-center py-4">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                  <p className="font-black text-lg text-white">Trip Completed!</p>
                  <p className="text-sm text-gray-400 mb-3">Collected {formatCurrency(activeTrip?.fare ?? 0)}. Log any cash or trip expenses next.</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setTripPhase('navigating'); setScreen('home'); }} className="flex-1 py-2.5 rounded-xl bg-gray-700 text-gray-200 text-sm font-bold active:scale-95 transition-all">Back to Home</button>
                    <button onClick={() => { setTripPhase('navigating'); setScreen('expenses'); }} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold active:scale-95 transition-all">Log Expenses</button>
                  </div>
                </div>
              )}
            </Card>}
          </div>
        )}

        {screen === 'expenses' && (
          <ExpenseTracker isOffline={!isOnline} expenses={expenses} collections={collections} onAddExpense={addExpense} onAddCollection={addCollection} onDeleteExpense={deleteExpense} todayHandover={todayHandover ?? null} onHandOver={handleHandOver} handoverLoading={handoverLoading} />
        )}

        {screen === 'earnings' && (
          <div className="space-y-4 pb-24">
            <Card className="p-5 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-4 text-white">Earnings Overview</h3>
              <div className="grid grid-cols-3 gap-3">
                {[{ label: 'Today', amount: todayRevenue, trips: completedTodayCount }, { label: 'This Week', amount: weekRevenue, trips: completedWeekCount }, { label: 'This Month', amount: monthRevenue, trips: completedMonthCount }].map(period => (
                  <div key={period.label} className="text-center p-3 bg-gray-800 rounded-xl border border-gray-700">
                    <p className="text-lg font-black text-white">{formatCurrency(period.amount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase">{period.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{period.trips} trips</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-3 text-white">Performance</h3>
              <div className="space-y-4">
                <div><div className="flex justify-between text-sm mb-1"><span className="text-gray-400">Acceptance Rate</span><span className="font-bold text-white">{acceptanceRate}%</span></div><Progress value={acceptanceRate} className="h-2" /></div>
                <div><div className="flex justify-between text-sm mb-1"><span className="text-gray-400">GPS Visibility</span><span className="font-bold text-white">{driverPosition ? 'Live' : isOnline ? 'Pending' : 'Offline'}</span></div><Progress value={driverPosition ? 100 : isOnline ? 45 : 10} className="h-2" /></div>
              </div>
            </Card>
          </div>
        )}

        {screen === 'documents' && (
          <div className="space-y-4 pb-24">
            <Card className="p-5 bg-gray-900 border-gray-800">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-white"><FileText className="h-4 w-4 text-blue-400" /> Documents</h3>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.name} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${doc.status === 'verified' ? 'bg-green-500/15' : doc.status === 'expiring' ? 'bg-orange-500/15' : 'bg-red-500/15'}`}>
                        {doc.status === 'verified' ? <CheckCircle className="h-4 w-4 text-green-400" /> : doc.status === 'expiring' ? <AlertTriangle className="h-4 w-4 text-orange-400" /> : <Clock className="h-4 w-4 text-red-400" />}
                      </div>
                      <div><p className="text-sm font-semibold text-white">{doc.name}</p>{doc.expiry && <p className="text-xs text-gray-400">Exp: {doc.expiry}</p>}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${doc.status === 'verified' ? 'bg-green-500/10 text-green-400 border-green-500/30' : doc.status === 'expiring' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>{doc.status}</span>
                      {doc.status !== 'verified' && <button className="flex items-center gap-1 h-7 px-2 text-xs rounded-lg bg-gray-700 text-gray-300 border border-gray-600 active:scale-95 transition-all"><Camera className="h-3 w-3" /> Upload</button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

