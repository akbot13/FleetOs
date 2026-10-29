import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { useOrgPricing } from '@/hooks/useSupabaseData';
import { vehicleClassLabel, type VehicleClass } from '@/lib/dispatch';
import { RateCardEditor } from './RateCardEditor';

type FieldKey =
  | 'city_base_fare'
  | 'airport_flat_fare'
  | 'sightseeing_per_hour'
  | 'outstation_per_day'
  | 'driver_stay_per_night'
  | 'night_surcharge_pct'
  | 'sedan_multiplier'
  | 'suv_multiplier';

interface FieldSpec {
  key: FieldKey;
  label: string;
  hint: string;
  // What quote_fare() charges while the field is empty.
  fallback: number;
  min: number;
  max?: number;
  step: string;
}

const fareFields: FieldSpec[] = [
  { key: 'city_base_fare', label: 'City ride base fare', hint: 'Rs per city ride', fallback: 180, min: 0, step: '1' },
  { key: 'airport_flat_fare', label: 'Airport flat fare', hint: 'Rs per airport transfer', fallback: 450, min: 0, step: '1' },
  { key: 'sightseeing_per_hour', label: 'Sightseeing per hour', hint: 'Rs per hour of the tour (4 hours if unspecified)', fallback: 550, min: 0, step: '1' },
  { key: 'outstation_per_day', label: 'Outstation per day', hint: 'Rs per day of an outstation trip', fallback: 3200, min: 0, step: '1' },
  { key: 'driver_stay_per_night', label: 'Driver stay per night', hint: 'Rs per night, when the driver has to stay over', fallback: 0, min: 0, step: '1' },
  { key: 'night_surcharge_pct', label: 'Night surcharge %', hint: 'Added to pickups from 10 PM to 6 AM India time', fallback: 0, min: 0, max: 100, step: '1' },
];

const sizeFields: FieldSpec[] = [
  { key: 'sedan_multiplier', label: '4-seater multiplier', hint: 'Sedan, up to 4 passengers. 1 means the fares above unchanged', fallback: 1, min: 0.5, max: 5, step: '0.05' },
  { key: 'suv_multiplier', label: '6-seater multiplier', hint: 'SUV, up to 6 passengers. 1.3 means 30% above the 4-seater fare', fallback: 1.3, min: 0.5, max: 5, step: '0.05' },
];

const allFields = [...fareFields, ...sizeFields];

type FormState = Record<FieldKey, string>;

const emptyForm = Object.fromEntries(allFields.map(f => [f.key, ''])) as FormState;

const tripTypes = [
  { id: 'city', label: 'City ride' },
  { id: 'airport', label: 'Airport transfer' },
  { id: 'sightseeing', label: 'Sightseeing (4 hrs)' },
  { id: 'outstation', label: 'Outstation (1 day)' },
] as const;

const carSizes: VehicleClass[] = ['4_seater', '6_seater'];

// Sample quotes use a 10:00 AM India-time pickup today, so the night surcharge never applies.
function sampleScheduledAt() {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${istNow.toISOString().slice(0, 10)}T10:00:00+05:30`;
}

export function PricingEngine() {
  const { org } = useOrg();
  const { data: pricing, isLoading } = useOrgPricing();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'card' | 'basic'>('card');

  const saved = useMemo<FormState>(() => {
    const next = { ...emptyForm };
    if (pricing) {
      for (const f of allFields) {
        const value = pricing[f.key];
        next[f.key] = value == null ? '' : String(value);
      }
    }
    return next;
  }, [pricing]);

  useEffect(() => {
    setForm(saved);
  }, [saved]);

  const errors = useMemo(() => {
    const found: Partial<Record<FieldKey, string>> = {};
    for (const f of allFields) {
      const raw = form[f.key].trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) found[f.key] = 'Enter a number';
      else if (n < f.min) found[f.key] = `Must be at least ${f.min}`;
      else if (f.max !== undefined && n > f.max) found[f.key] = `Must be at most ${f.max}`;
    }
    return found;
  }, [form]);

  const hasErrors = Object.keys(errors).length > 0;
  const hasChanges = allFields.some(f => form[f.key].trim() !== saved[f.key]);

  const { data: samples, isFetching: samplesLoading, isError: samplesFailed } = useQuery({
    queryKey: ['fare-quote', 'samples', org?.id, pricing?.updated_at ?? null],
    enabled: !!org?.id,
    queryFn: async () => {
      const scheduledAt = sampleScheduledAt();
      const rows = await Promise.all(
        tripTypes.flatMap(t => carSizes.map(async size => {
          const { data, error } = await supabase.rpc('quote_fare', {
            p_org_id: org!.id,
            p_booking: { trip_type: t.id, vehicle_class: size, scheduled_at: scheduledAt },
          });
          if (error) throw error;
          return [`${t.id}:${size}`, Number(data)] as const;
        })),
      );
      return Object.fromEntries(rows) as Record<string, number>;
    },
  });

  const handleSave = async () => {
    if (!org?.id || hasErrors || !hasChanges) return;
    setSaving(true);
    const values = Object.fromEntries(
      allFields.map(f => [f.key, form[f.key].trim() === '' ? null : Number(form[f.key])]),
    ) as Record<FieldKey, number | null>;

    const { error } = await supabase
      .from('org_pricing')
      .upsert({ org_id: org.id, ...values, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
    setSaving(false);

    if (error) {
      toast.error(`Could not save pricing: ${error.message}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['org_pricing', org.id] });
    await queryClient.invalidateQueries({ queryKey: ['fare-quote'] });
    toast('Pricing saved. New bookings use these rates.');
  };

  const renderField = (f: FieldSpec) => (
    <div key={f.key}>
      <Label htmlFor={f.key} className="text-sm font-medium">{f.label}</Label>
      <Input
        id={f.key}
        type="number"
        inputMode="decimal"
        min={f.min}
        max={f.max}
        step={f.step}
        value={form[f.key]}
        placeholder={String(f.fallback)}
        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
        className={errors[f.key] ? 'mt-1.5 border-destructive' : 'mt-1.5'}
      />
      <p className={errors[f.key] ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>
        {errors[f.key] ?? f.hint}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary px-6 pt-8 pb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-5 w-5 text-secondary" />
            <span className="text-sm font-semibold text-secondary tracking-wide uppercase">Pricing Engine</span>
          </div>
          <h1 className="text-xl font-bold text-primary-foreground">Fare Configuration</h1>
          <p className="text-xs text-primary-foreground/60 mt-1">Set your rate card. Customers are charged these fares as soon as you save.</p>
          <div className="mt-4 inline-flex rounded-full bg-primary-foreground/10 p-1" role="tablist" aria-label="Pricing views">
            {([['card', 'Rate card'], ['basic', 'Basic rates']] as const).map(([id, label]) => (
              <button
                key={id} type="button" role="tab" aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${tab === id ? 'bg-secondary text-secondary-foreground' : 'text-primary-foreground/70 hover:text-primary-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-3 pb-8 space-y-4">
        {tab === 'card' ? <RateCardEditor /> : isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Card className="p-5 shadow-card rounded-xl">
              <h2 className="text-sm font-bold mb-1">Base fares</h2>
              <p className="text-xs text-muted-foreground mb-4">
                An empty field uses the default shown in grey.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {fareFields.map(renderField)}
              </div>
            </Card>

            <Card className="p-5 shadow-card rounded-xl">
              <h2 className="text-sm font-bold mb-1">Car size</h2>
              <p className="text-xs text-muted-foreground mb-4">
                The base fare is multiplied by the size the customer picks.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {sizeFields.map(renderField)}
              </div>
            </Card>

            <div className="flex items-center justify-end gap-3">
              {hasChanges && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
              <Button onClick={handleSave} disabled={!hasChanges || hasErrors || saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? 'Saving...' : 'Save pricing'}
              </Button>
            </div>

            <Card className="p-5 shadow-card rounded-xl">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold">Sample fares</h2>
                {samplesLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                What a customer is charged today at 10 AM, from the saved rates. Return trips double city and airport fares.
              </p>
              {samplesFailed ? (
                <p className="text-sm text-destructive">Could not load sample fares.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Trip</th>
                        {carSizes.map(size => (
                          <th key={size} className="pb-2 font-medium text-right">{vehicleClassLabel[size]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tripTypes.map(t => (
                        <tr key={t.id} className="border-t">
                          <td className="py-2">{t.label}</td>
                          {carSizes.map(size => {
                            const fare = samples?.[`${t.id}:${size}`];
                            return (
                              <td key={size} className="py-2 text-right font-semibold">
                                {fare === undefined ? '...' : `₹${fare.toLocaleString('en-IN')}`}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
