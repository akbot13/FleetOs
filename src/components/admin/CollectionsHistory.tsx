import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCollectionsByDate, useCollectionsByRange, useDrivers } from '@/hooks/useSupabaseData';
import { downloadCsv, toCsv } from '@/lib/csv';

type Mode = 'day' | 'week' | 'month';

// A booking as the collections queries return it.
interface CollectionBooking {
  id: number;
  scheduled_at: string | null;
  customer_name: string | null;
  pickup: string | null;
  drop: string | null;
  status: string | null;
  driver_id: number | null;
  fare: number | null;
  amount_collected: number | null;
  payment_method: string | null;
  payment_confirmed_at: string | null;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getPaymentStatus(b: Pick<CollectionBooking, 'payment_confirmed_at' | 'amount_collected' | 'fare'>): 'paid' | 'partial' | 'unpaid' {
  if (!b.payment_confirmed_at) return 'unpaid';
  const collected = b.amount_collected ?? 0;
  const fare = b.fare ?? 0;
  if (collected >= fare) return 'paid';
  if (collected > 0) return 'partial';
  return 'unpaid';
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getRange(mode: Mode, offset: number): { start: string; end: string; label: string } {
  const now = new Date();

  if (mode === 'day') {
    const d = addDays(now, offset);
    return {
      start: toDateStr(d),
      end: toDateStr(d),
      label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    };
  }

  if (mode === 'week') {
    const end = addDays(now, offset * 7);
    const start = addDays(end, -6);
    return {
      start: toDateStr(start),
      end: toDateStr(end),
      label: `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
    };
  }

  // month
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: toDateStr(start),
    end: toDateStr(end),
    label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}

// ─── BAR CHART ────────────────────────────────────────────────────────────────

function BarChart({ bars }: { bars: { label: string; amount: number }[] }) {
  const max = Math.max(...bars.map(b => b.amount), 1);
  return (
    <div className="flex items-end gap-1 h-16 mt-3">
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="w-full flex items-end justify-center" style={{ height: 48 }}>
            <div
              className="w-full bg-secondary/80 rounded-t transition-all"
              style={{ height: `${Math.max(Math.round((bar.amount / max) * 48), bar.amount > 0 ? 3 : 0)}px` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── BOOKING ROW ──────────────────────────────────────────────────────────────

function BookingRow({ b }: { b: CollectionBooking }) {
  const status = getPaymentStatus(b);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm font-semibold truncate">{b.customer_name ?? 'Unknown'}</p>
        <p className="text-xs text-muted-foreground truncate">{b.pickup ?? '?'} → {b.drop ?? '?'}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-bold">₹{(b.fare ?? 0).toLocaleString('en-IN')}</span>
        {status === 'paid' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/30 font-medium">Paid</span>
        )}
        {status === 'partial' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30 font-medium">
            Part ₹{b.amount_collected}
          </span>
        )}
        {status === 'unpaid' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Unpaid</span>
        )}
        {b.payment_method && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary-foreground border border-secondary/20 font-medium capitalize">
            {b.payment_method}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── SUMMARY CARD ─────────────────────────────────────────────────────────────

function SummaryCard({ bookings, label }: { bookings: CollectionBooking[]; label: string }) {
  const totalFare = bookings.reduce((s, b) => s + (b.fare ?? 0), 0);
  const totalCollected = bookings
    .filter(b => b.payment_confirmed_at)
    .reduce((s, b) => s + (b.amount_collected ?? 0), 0);
  const cashTotal = bookings
    .filter(b => b.payment_confirmed_at && b.payment_method === 'cash')
    .reduce((s, b) => s + (b.amount_collected ?? 0), 0);
  const digitalTotal = totalCollected - cashTotal;
  const pendingCount = bookings.filter(b => !b.payment_confirmed_at).length;
  const progressPct = totalFare > 0 ? Math.round((totalCollected / totalFare) * 100) : 0;

  return (
    <Card className="p-4 shadow-card rounded-xl">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-2xl font-bold leading-tight">₹{totalCollected.toLocaleString('en-IN')}</p>
      <p className="text-xs text-muted-foreground mb-3">collected · ₹{totalFare.toLocaleString('en-IN')} total fares</p>
      <div className="flex items-center divide-x divide-border mb-3">
        <span className="text-xs pr-3">₹{cashTotal.toLocaleString('en-IN')} cash</span>
        <span className="text-xs px-3">₹{digitalTotal.toLocaleString('en-IN')} digital</span>
        <span className={`text-xs pl-3 ${pendingCount > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {pendingCount} pending
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className="bg-success h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{progressPct}% of fares collected</p>
    </Card>
  );
}

// The period's bookings as a spreadsheet for the fleet's accounts. Times are India time.

function downloadBookingsCsv(bookings: CollectionBooking[], drivers: { id: number; name: string | null }[], start: string, end: string) {
  const driverName = new Map(drivers.map(d => [d.id, d.name ?? '']));
  const ist = (iso: string | null, opts: Intl.DateTimeFormatOptions) =>
    iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...opts }) : '';
  const csv = toCsv(bookings, [
    { header: 'Booking ID', value: b => b.id },
    { header: 'Date', value: b => ist(b.scheduled_at, { year: 'numeric', month: '2-digit', day: '2-digit' }) },
    { header: 'Time', value: b => ist(b.scheduled_at, { hour: '2-digit', minute: '2-digit', hour12: false }) },
    { header: 'Customer', value: b => b.customer_name },
    { header: 'Pickup', value: b => b.pickup },
    { header: 'Drop', value: b => b.drop },
    { header: 'Trip status', value: b => b.status },
    { header: 'Driver', value: b => (b.driver_id != null ? driverName.get(b.driver_id) : '') },
    { header: 'Fare (Rs)', value: b => b.fare },
    { header: 'Collected (Rs)', value: b => b.amount_collected },
    { header: 'Paid by', value: b => b.payment_method },
    { header: 'Payment', value: b => getPaymentStatus(b) },
    { header: 'Paid at', value: b => ist(b.payment_confirmed_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) },
  ]);
  downloadCsv(start === end ? `bookings-${start}.csv` : `bookings-${start}-to-${end}.csv`, csv);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function CollectionsHistory() {
  const [mode, setMode] = useState<Mode>('day');
  const [offset, setOffset] = useState(0);

  const { start, end, label } = getRange(mode, offset);
  const { data: drivers = [] } = useDrivers();

  // Day mode uses single-day hook; week/month use range hook
  const dayQuery = useCollectionsByDate(start);
  const rangeQuery = useCollectionsByRange(start, end);
  const bookings: CollectionBooking[] = mode === 'day' ? (dayQuery.data ?? []) : (rangeQuery.data ?? []);
  const isLoading = mode === 'day' ? dayQuery.isLoading : rangeQuery.isLoading;

  // Build bar chart data
  const barBuckets: { label: string; amount: number }[] = (() => {
    if (mode === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(new Date(start), i);
        const ds = toDateStr(d);
        const amount = bookings
          .filter(b => b.scheduled_at?.startsWith(ds) && b.payment_confirmed_at)
          .reduce((s, b) => s + (b.amount_collected ?? 0), 0);
        return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), amount };
      });
    }
    if (mode === 'month') {
      const startD = new Date(start);
      const endD = new Date(end);
      const weeks: { label: string; amount: number }[] = [];
      let cursor = new Date(startD);
      let weekNum = 1;
      while (cursor <= endD) {
        const wStart = toDateStr(cursor);
        const wEnd = toDateStr(addDays(cursor, 6));
        const amount = bookings
          .filter(b => b.scheduled_at >= wStart + 'T00:00:00' && b.scheduled_at <= wEnd + 'T23:59:59' && b.payment_confirmed_at)
          .reduce((s, b) => s + (b.amount_collected ?? 0), 0);
        weeks.push({ label: `W${weekNum}`, amount });
        cursor = addDays(cursor, 7);
        weekNum++;
      }
      return weeks;
    }
    return [];
  })();

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={() => setOffset(o => o - 1)}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-center flex-1 truncate px-1">{label}</span>
          <button
            onClick={() => setOffset(o => o + 1)}
            disabled={offset >= 0}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Mode pills */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg shrink-0">
          {(['day', 'week', 'month'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setOffset(0); }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition capitalize ${
                mode === m ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground shadow-card rounded-xl">Loading…</Card>
      ) : (
        <>
          <SummaryCard bookings={bookings} label={label} />

          {/* Bar chart for week/month */}
          {(mode === 'week' || mode === 'month') && barBuckets.length > 0 && (
            <Card className="p-4 shadow-card rounded-xl">
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {mode === 'week' ? 'Daily collections' : 'Weekly collections'}
              </p>
              <BarChart bars={barBuckets} />
            </Card>
          )}

          {/* Booking list */}
          <Card className="p-4 shadow-card rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
              </p>
              {bookings.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadBookingsCsv(bookings, drivers, start, end)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download for Excel
                </button>
              )}
            </div>
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No bookings for this period</p>
            ) : (
              bookings.map(b => <BookingRow key={b.id} b={b} />)
            )}
          </Card>
        </>
      )}
    </div>
  );
}
