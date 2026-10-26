import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Clock3, CreditCard, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type SupabaseDriver } from '@/hooks/useSupabaseData';
import { useOrg } from '@/hooks/useOrg';
import { queueAssignmentMessage } from '@/lib/customerAutomation';
import { LocationInput } from '@/components/customer/LocationInput';
import { TripPreviewMap } from '@/components/maps/TripPreviewMap';
import { vehicleClassLabel, type VehicleClass } from '@/lib/dispatch';

interface NewBookingSheetProps {
  open: boolean;
  onClose: () => void;
  drivers: SupabaseDriver[];
}

interface FormValues {
  customerName: string;
  countryCode: string;
  customerPhone: string;
  tripType: 'city' | 'airport' | 'sightseeing' | 'outstation';
  vehicleClass: VehicleClass;
  pickup: string;
  drop: string;
  date: string;
  time: string;
  fare: string;
  driverId: string;
  paymentMethod: 'cash' | 'upi' | 'card';
  notes: string;
}

const today = new Date().toISOString().split('T')[0];
const currentHour = `${String(new Date().getHours()).padStart(2, '0')}:00`;

export function NewBookingSheet({ open, onClose, drivers }: NewBookingSheetProps) {
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { org } = useOrg();

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      customerName: '',
      countryCode: '+91',
      customerPhone: '',
      tripType: 'city',
      vehicleClass: '4_seater',
      pickup: '',
      drop: '',
      date: today,
      time: currentHour,
      fare: '',
      driverId: '',
      paymentMethod: 'cash',
      notes: '',
    },
  });

  const tripType = watch('tripType');
  const paymentMethod = watch('paymentMethod');
  const countryCode = watch('countryCode');
  const pickup = watch('pickup');
  const drop = watch('drop');
  const driverId = watch('driverId');
  const date = watch('date');
  const time = watch('time');
  const freeDrivers = drivers.filter(driver => driver.status === 'free');
  const selectedDriver = driverId
    ? freeDrivers.find(driver => driver.id === parseInt(driverId, 10)) ?? null
    : null;
  const routeSubtitle = pickup && drop
    ? 'Dispatch-grade route preview with highlighted path'
    : pickup
      ? 'Add a destination to highlight the trip route'
      : 'Start with a pickup to build the route preview';

  const onSubmit = async (data: FormValues) => {
    setSubmitLoading(true);
    setSubmitError(null);

    const scheduledAt = new Date(data.date + 'T' + data.time + ':00').toISOString();
    const normalizedPhone = data.customerPhone.replace(/\D/g, '').slice(0, 10);
    const assignedDriver = data.driverId
      ? drivers.find(driver => driver.id === parseInt(data.driverId, 10)) ?? null
      : null;
    const status = assignedDriver ? 'confirmed' : 'pending';

    // An empty fare means "charge the rate card", so the admin sees the same price a customer would.
    let fare = parseFloat(data.fare) || null;
    if (fare === null) {
      const { data: quote, error: quoteError } = await supabase.rpc('quote_fare', {
        p_org_id: org!.id,
        p_booking: { trip_type: data.tripType, vehicle_class: data.vehicleClass, scheduled_at: scheduledAt },
      });
      if (quoteError) {
        setSubmitError(quoteError.message);
        setSubmitLoading(false);
        return;
      }
      fare = Number(quote);
    }

    const db = supabase;
    const { data: insertedBooking, error } = await db
      .from('bookings')
      .insert({
        org_id: org!.id,
        customer_name: data.customerName,
        customer_phone: normalizedPhone ? `${data.countryCode}${normalizedPhone}` : null,
        trip_type: data.tripType,
        vehicle_class: data.vehicleClass,
        pickup: data.pickup,
        drop: data.drop,
        scheduled_at: scheduledAt,
        fare,
        driver_id: data.driverId ? parseInt(data.driverId, 10) : null,
        payment_method: data.paymentMethod,
        status,
        notes: data.notes.trim() || null,
      })
      .select('id, customer_name, customer_phone, pickup, drop, fare, payment_method, scheduled_at')
      .single();

    if (error) {
      setSubmitError(error.message);
      setSubmitLoading(false);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    if (insertedBooking && assignedDriver) {
      await queueAssignmentMessage(insertedBooking, assignedDriver, org);
    }
    toast('Booking saved');
    reset();
    onClose();
    setSubmitLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[2rem] px-4 pb-6 sm:px-6">
        <SheetHeader className="mb-5">
          <SheetTitle>New Booking</SheetTitle>
        </SheetHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <form onSubmit={handleSubmit(onSubmit)} className="order-2 space-y-4 lg:order-1">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Customer name</label>
              <Input
                autoFocus
                placeholder="Full name"
                {...register('customerName', { required: true })}
                className={errors.customerName ? 'border-destructive' : ''}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Phone</label>
              <div className="flex items-center gap-2">
                <select
                  {...register('countryCode')}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {['+91', '+971', '+1', '+44', '+61'].map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <Input
                  type="tel"
                  placeholder="10-digit number"
                  maxLength={10}
                  {...register('customerPhone', {
                    required: true,
                    minLength: 10,
                    onChange: event => {
                      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
                    },
                  })}
                  className={errors.customerPhone ? 'flex-1 border-destructive' : 'flex-1'}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Default country code is {countryCode}. Number is limited to 10 digits.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Trip type</label>
              <div className="flex flex-wrap gap-2">
                {(['city', 'airport', 'sightseeing', 'outstation'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setValue('tripType', type)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      tripType === type
                        ? 'border-secondary bg-secondary text-secondary-foreground'
                        : 'border-input text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Car size</label>
              <select
                {...register('vehicleClass')}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="4_seater">{vehicleClassLabel['4_seater']} (sedan, up to 4)</option>
                <option value="6_seater">{vehicleClassLabel['6_seater']} (SUV, up to 6)</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Pickup</label>
              <input type="hidden" {...register('pickup', { required: true })} />
              <LocationInput
                value={pickup}
                onChange={nextValue => setValue('pickup', nextValue, { shouldDirty: true, shouldValidate: true })}
                placeholder="Pickup location"
                icon="pickup"
              />
              {errors.pickup && <p className="mt-1 text-xs text-destructive">Pickup is required.</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Drop</label>
              <input type="hidden" {...register('drop')} />
              <LocationInput
                value={drop}
                onChange={nextValue => setValue('drop', nextValue, { shouldDirty: true, shouldValidate: true })}
                placeholder="Drop location"
                icon="drop"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Date</label>
                <Input type="date" {...register('date')} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Time</label>
                <Input type="time" {...register('time')} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Fare</label>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">Rs</span>
                <Input type="number" placeholder="Leave empty for the rate card fare" {...register('fare')} className="flex-1" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Assign driver</label>
              <select
                {...register('driverId')}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unassigned</option>
                {freeDrivers.map(driver => (
                  <option key={driver.id} value={String(driver.id)}>
                    {driver.name ?? 'Unknown'} - {driver.vehicle_model ?? 'N/A'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Payment method</label>
              <div className="flex gap-2">
                {(['cash', 'upi', 'card'] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setValue('paymentMethod', method)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      paymentMethod === method
                        ? 'border-secondary bg-secondary text-secondary-foreground'
                        : 'border-input text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {method.charAt(0).toUpperCase() + method.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Notes</label>
              <textarea
                rows={3}
                placeholder="Any special instructions..."
                {...register('notes')}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitLoading}>
              {submitLoading ? 'Saving...' : 'Save Booking'}
            </Button>
          </form>

          <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-4">
            <TripPreviewMap
              pickup={pickup}
              drop={drop}
              title="Dispatch map"
              subtitle={routeSubtitle}
            />

            <div className="rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-elevated">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Trip snapshot</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3">
                  <Clock3 className="h-4 w-4 text-secondary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Pickup slot</p>
                    <p className="text-sm font-semibold text-foreground">{date && time ? `${date} · ${time}` : 'Select date and time'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3">
                  <Users className="h-4 w-4 text-secondary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Driver status</p>
                    <p className="text-sm font-semibold text-foreground">{selectedDriver ? `${selectedDriver.name ?? 'Driver'} ready` : `${freeDrivers.length} free drivers available`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3">
                  <CreditCard className="h-4 w-4 text-secondary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Payment mode</p>
                    <p className="text-sm font-semibold text-foreground">{paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
