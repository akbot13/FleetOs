import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';

// Admin sets the 6-digit PIN a driver signs in with. The PIN is stored hashed; setting a new
// one signs the driver out of any phone they were signed in on.
export function DriverPinControl({ driverId, driverName }: { driverId: number; driverName: string | null }) {
  const { org } = useOrg();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: driversWithPin } = useQuery({
    queryKey: ['drivers-with-pin', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('drivers_with_pin', { p_org_id: org!.id });
      if (error) return [] as number[];
      return (data ?? []) as number[];
    },
  });
  const hasPin = (driversWithPin ?? []).includes(driverId);

  const save = async () => {
    if (!/^\d{6}$/.test(pin)) {
      toast.error('PIN must be exactly 6 digits');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('set_driver_pin', { p_driver_id: driverId, p_pin: pin });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Couldn't set the PIN");
      return;
    }
    setPin('');
    queryClient.invalidateQueries({ queryKey: ['drivers-with-pin'] });
    toast(`PIN set for ${driverName ?? 'driver'}. Share it with them directly.`);
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
        <span className="flex items-center gap-1"><KeyRound className="w-3 h-3" /> Login PIN</span>
        <span className={`font-medium ${hasPin ? 'text-success' : 'text-warning'}`}>{hasPin ? 'Set' : 'Not set'}</span>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={hasPin ? 'New 6-digit PIN' : '6-digit PIN'}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5"
          aria-label={`Login PIN for ${driverName ?? 'driver'}`}
        />
        <button
          onClick={save}
          disabled={saving || pin.length !== 6}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : hasPin ? 'Reset PIN' : 'Set PIN'}
        </button>
      </div>
    </div>
  );
}
