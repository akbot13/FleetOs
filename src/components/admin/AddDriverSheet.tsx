import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { vehicleClassLabel, type VehicleClass } from '@/lib/dispatch';
import { DriverPinControl } from './DriverPinControl';

interface AddDriverSheetProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  phone: string;
  vehicleModel: string;
  plateNumber: string;
  vehicleClass: VehicleClass;
}

const emptyForm: FormValues = { name: '', phone: '', vehicleModel: '', plateNumber: '', vehicleClass: '4_seater' };

// The owner adds a driver directly, so the driver is approved from the start. They can't sign
// in until they have a PIN, so the sheet ends on setting one.
export function AddDriverSheet({ open, onClose }: AddDriverSheetProps) {
  const { org } = useOrg();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: number; name: string } | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({ defaultValues: emptyForm });
  const vehicleClass = watch('vehicleClass');

  const close = () => {
    reset(emptyForm);
    setAdded(null);
    setSaveError(null);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    if (!org) return;
    setSaving(true);
    setSaveError(null);
    const digits = values.phone.replace(/\D/g, '').slice(-10);

    const { data: existing, error: lookupError } = await supabase
      .from('drivers').select('id, phone').eq('org_id', org.id);
    if (lookupError) {
      setSaving(false);
      setSaveError("Couldn't check existing drivers. Try again.");
      return;
    }
    if ((existing ?? []).some(d => (d.phone ?? '').replace(/\D/g, '').slice(-10) === digits)) {
      setSaving(false);
      setSaveError('A driver with this phone number is already in your fleet.');
      return;
    }

    const { data, error } = await supabase
      .from('drivers')
      .insert({
        org_id: org.id,
        name: values.name.trim(),
        phone: `+91${digits}`,
        vehicle_model: values.vehicleModel.trim() || null,
        plate_number: values.plateNumber.trim().toUpperCase() || null,
        vehicle_class: values.vehicleClass,
        status: 'offline',
      })
      .select('id, name')
      .single();
    setSaving(false);
    if (error || !data) {
      setSaveError("Couldn't add the driver. Try again.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    setAdded({ id: data.id, name: data.name ?? values.name.trim() });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{added ? `${added.name} added` : 'Add driver'}</SheetTitle>
        </SheetHeader>

        {added ? (
          <div className="mt-6 space-y-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-success" />
              Set a PIN so they can sign in with their phone number.
            </p>
            <DriverPinControl driverId={added.id} driverName={added.name} />
            <Button type="button" variant="outline" className="w-full" onClick={close}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="driver-name">Full name</Label>
              <Input id="driver-name" autoComplete="off" {...register('name', { required: 'Enter the driver\'s name', validate: v => v.trim().length > 1 || 'Enter the driver\'s name' })} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-phone">Mobile number</Label>
              <Input id="driver-phone" type="tel" inputMode="numeric" placeholder="9876543210" autoComplete="off"
                {...register('phone', { validate: v => v.replace(/\D/g, '').length >= 10 || 'Enter a 10-digit mobile number' })} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-vehicle">Car model</Label>
              <Input id="driver-vehicle" placeholder="Swift Dzire" autoComplete="off" {...register('vehicleModel')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-plate">Plate number</Label>
              <Input id="driver-plate" placeholder="RJ14 AB 1234" autoComplete="off" {...register('plateNumber')} />
            </div>
            <div className="space-y-2">
              <Label>Car size</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['4_seater', '6_seater'] as VehicleClass[]).map(size => (
                  <Button key={size} type="button" variant={vehicleClass === size ? 'default' : 'outline'}
                    aria-pressed={vehicleClass === size} onClick={() => setValue('vehicleClass', size)}>
                    {vehicleClassLabel[size]}
                  </Button>
                ))}
              </div>
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add driver
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
