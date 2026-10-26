import { useState, useEffect } from 'react';
import { Clock, Navigation, Phone, CheckCircle, AlertTriangle, Zap, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDrivers, tripTypeIcons, getDriverInitials, type SupabaseDriver, type SupabaseBooking } from '@/hooks/useSupabaseData';
import { useOrg } from '@/hooks/useOrg';
import { supabase } from '@/integrations/supabase/client';
import { queueAssignmentMessage } from '@/lib/customerAutomation';
import { olaGeocode } from '@/lib/olaMaps';
import { rankDrivers, type RankedDriver } from '@/lib/dispatch';

interface DispatchEngineProps {
  booking: SupabaseBooking | null;
  open: boolean;
  onClose: () => void;
  onAssign: (bookingId: number, driverId: number) => void;
}

type DriverCandidate = RankedDriver<SupabaseDriver>;

// ── Conflict check ────────────────────────────────────────────────────────────
// Returns the conflicting booking's scheduled_at if driver is busy, else null
async function getConflict(driverId: number, tripTime: string, orgId: string): Promise<string | null> {
  const t = new Date(tripTime).getTime();
  const windowStart = new Date(t - 2 * 60 * 60 * 1000).toISOString(); // -2hr
  const windowEnd   = new Date(t + 4 * 60 * 60 * 1000).toISOString(); // +4hr

  const { data } = await supabase
    .from('bookings')
    .select('id, scheduled_at')
    .eq('org_id', orgId)
    .eq('driver_id', driverId)
    .in('status', ['confirmed', 'in-progress'])
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .limit(1);

  if (data && data.length > 0) return data[0].scheduled_at;
  return null;
}

function formatConflictTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function DispatchEngine({ booking, open, onClose, onAssign }: DispatchEngineProps) {
  const [assigning, setAssigning] = useState<number | null>(null);
  const [assigned, setAssigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DriverCandidate[]>([]);
  const [checking, setChecking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: drivers = [] } = useDrivers();
  const { org } = useOrg();

  // ── Build candidates with conflict check whenever dialog opens ────────────
  useEffect(() => {
    if (!open || !booking || !org) return;

    const scheduledAt = booking.scheduled_at ?? new Date().toISOString();

    const build = async () => {
      setChecking(true);
      const freeDrivers = drivers.filter(d => d.status === 'free');

      // Real distances: place the pickup on the map, then measure from each driver's last GPS fix.
      const [place, conflictList] = await Promise.all([
        booking.pickup ? olaGeocode(booking.pickup).catch(() => null) : Promise.resolve(null),
        Promise.all(freeDrivers.map(d => getConflict(d.id, scheduledAt, org.id))),
      ]);
      const conflicts = Object.fromEntries(freeDrivers.map((d, i) => [d.id, conflictList[i]]));
      const pickup = place ? { lat: place.lat, lng: place.lng } : null;

      setCandidates(rankDrivers(freeDrivers, pickup, conflicts, formatConflictTime));
      setChecking(false);
    };

    build();
  }, [open, booking, drivers, org, refreshKey]);

  if (!booking) return null;

  const available = candidates.filter(d => !d.isBusy);
  const busy      = candidates.filter(d => d.isBusy);
  const topPick   = available[0];

  const handleAssign = async (driverId: number) => {
    setAssigning(driverId);
    setError(null);
    try {
      const selectedDriver = candidates.find(candidate => candidate.id === driverId) ?? drivers.find(driver => driver.id === driverId);
      const db = supabase;
      const { error: bookingError } = await db
        .from('bookings')
        .update({
          driver_id: driverId,
          status: 'confirmed',
          dispatched_at: new Date().toISOString(),
          driver_confirmed_at: null,
        })
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      if (selectedDriver) {
        await queueAssignmentMessage(booking, selectedDriver, org);
      }

      setAssigned(true);
      onAssign(booking.id, driverId);

      setTimeout(() => {
        setAssigned(false);
        setAssigning(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message ?? 'Assignment failed');
      setAssigning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-secondary" />
            Dispatch — Assign Driver
          </DialogTitle>
          <DialogDescription>
            {tripTypeIcons[booking.trip_type ?? 'city']} {booking.pickup ?? '?'} → {booking.drop ?? '?'}
          </DialogDescription>
        </DialogHeader>

        {/* Booking summary */}
        <Card className="p-3 bg-muted/50">
          <div className="flex justify-between text-sm">
            <div>
              <p className="font-semibold">{booking.customer_name ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{booking.customer_phone ?? 'N/A'}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">₹{booking.fare ?? 0}</p>
              {booking.scheduled_at && (
                <p className="text-xs text-muted-foreground">
                  {new Date(booking.scheduled_at).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit', hour12: true,
                  })}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Checking state */}
        {checking && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <div className="h-4 w-4 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
            Checking driver availability...
          </div>
        )}

        {/* Success */}
        {assigned && (
          <div className="text-center py-6">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
            <p className="font-bold text-success">Driver Assigned!</p>
            <p className="text-xs text-muted-foreground">Notification sent to driver</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive font-medium">{error}</p>
        )}

        {!checking && !assigned && (
          <>
            {/* Auto-assign recommendation */}
            {topPick && (
              <div className="border-2 border-success/40 rounded-xl p-3 bg-success/5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-xs font-bold text-success uppercase tracking-wider">Recommended</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                      {getDriverInitials(topPick.name)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{topPick.name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{topPick.vehicle_model ?? 'N/A'}</p>
                      <p className="text-xs text-success font-medium">{topPick.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{topPick.distanceKm != null ? `${topPick.distanceKm} km` : 'Distance unknown'}</p>
                    {topPick.etaMinutes != null && <p className="text-xs text-muted-foreground">~{topPick.etaMinutes} min ETA</p>}
                  </div>
                </div>
                <Button
                  className="w-full mt-3 bg-success text-success-foreground hover:bg-success/90"
                  size="sm"
                  onClick={() => handleAssign(topPick.id)}
                  disabled={!!assigning}
                >
                  {assigning === topPick.id ? 'Assigning...' : 'Auto-Assign Best Match'}
                </Button>
              </div>
            )}

            {/* ── AVAILABLE section ─────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Available ({available.length})
              </h4>
              <Button
                variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => setRefreshKey(k => k + 1)}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Refresh
              </Button>
            </div>

            <div className="space-y-2">
              {available.map((driver) => (
                <Card key={driver.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                          {getDriverInitials(driver.name)}
                        </div>
                        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[9px] font-bold">
                          {driver.score}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{driver.name ?? 'Unknown'}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {driver.distanceKm != null ? (
                            <>
                              <span className="flex items-center gap-0.5">
                                <Navigation className="h-3 w-3" />{driver.distanceKm} km
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />~{driver.etaMinutes} min
                              </span>
                            </>
                          ) : (
                            <span>{driver.reason}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="icon" variant="outline" className="h-8 w-8">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" className="h-8 text-xs"
                        onClick={() => handleAssign(driver.id)}
                        disabled={!!assigning}
                      >
                        {assigning === driver.id ? '...' : 'Assign'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              {available.length === 0 && (
                <div className="text-center py-6">
                  <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-2" />
                  <p className="font-semibold text-sm">No conflict-free drivers available</p>
                  <p className="text-xs text-muted-foreground mt-1">All free drivers have clashing bookings</p>
                </div>
              )}
            </div>

            {/* ── BUSY section ──────────────────────────────────────────── */}
            {busy.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Busy — Clashing Bookings ({busy.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {busy.map((driver) => (
                    <Card key={driver.id} className="p-3 opacity-60 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                            {getDriverInitials(driver.name)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-muted-foreground">{driver.name ?? 'Unknown'}</p>
                            <p className="text-xs text-destructive font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {driver.reason}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                          Busy
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {candidates.length === 0 && (
              <div className="text-center py-8">
                <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-2" />
                <p className="font-semibold text-sm">No drivers available</p>
                <p className="text-xs text-muted-foreground mt-1">All drivers are on trips or offline</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
