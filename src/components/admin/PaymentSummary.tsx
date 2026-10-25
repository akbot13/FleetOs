import { Card } from '@/components/ui/card';
import { type SupabaseBooking } from '@/hooks/useSupabaseData';

interface PaymentSummaryProps {
  bookings: SupabaseBooking[];
}

export function PaymentSummary({ bookings }: PaymentSummaryProps) {
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.scheduled_at?.startsWith(today));

  const totalFare = todayBookings.reduce((sum, b) => sum + (b.fare ?? 0), 0);
  const totalCollected = todayBookings
    .filter(b => b.payment_confirmed_at != null)
    .reduce((sum, b) => sum + (b.amount_collected ?? 0), 0);
  const cashTotal = todayBookings
    .filter(b => b.payment_confirmed_at != null && b.payment_method === 'cash')
    .reduce((sum, b) => sum + (b.amount_collected ?? 0), 0);
  const upiTotal = totalCollected - cashTotal;
  const pendingCount = todayBookings.filter(b => b.payment_confirmed_at == null).length;
  const partialCount = todayBookings.filter(b =>
    b.payment_confirmed_at != null &&
    (b.amount_collected ?? 0) < (b.fare ?? 0)
  ).length;
  const progressPct = totalFare > 0 ? Math.round((totalCollected / totalFare) * 100) : 0;

  return (
    <Card className="p-4 shadow-card rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold">Today's Collections</span>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      <p className="text-2xl font-bold leading-tight">₹{totalCollected.toLocaleString('en-IN')}</p>
      <p className="text-xs text-muted-foreground mb-3">collected today</p>

      <div className="flex items-center divide-x divide-border mb-3">
        <span className="text-xs pr-3">{cashTotal.toLocaleString('en-IN')} cash</span>
        <span className="text-xs px-3">{upiTotal.toLocaleString('en-IN')} digital</span>
        <span className={`text-xs pl-3 ${pendingCount > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {pendingCount} pending
        </span>
        {partialCount > 0 && (
          <>
            <span className="text-border px-1">|</span>
            <span className="text-xs text-warning font-medium">{partialCount} partial</span>
          </>
        )}
      </div>

      <div className="w-full bg-muted rounded-full h-1.5" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="bg-success h-1.5 rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{progressPct}% of today's fares collected</p>
    </Card>
  );
}
