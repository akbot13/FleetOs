import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { useOrgPricing } from '@/hooks/useSupabaseData';
import {
  defaultPlan, fareModelHint, fareModelLabel, quoteFare, rateCardFromLegacy, rateCardProblems,
  tripTypeLabel, tripTypes,
  type FareModel, type FarePlan, type RateCard, type TripRequest, type TripType, type VehicleClass,
} from '@/lib/pricing';

const models: FareModel[] = ['flat', 'distance', 'meter', 'hourly', 'package', 'per_day', 'outstation_km'];
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Labels for every number a plan can have, in the order they're shown.
const planFields: Record<FareModel, { key: string; label: string; step?: string }[]> = {
  flat: [{ key: 'amount', label: 'Price (₹)' }],
  distance: [
    { key: 'base', label: 'Base fare (₹)' },
    { key: 'included_km', label: 'Km included in base', step: '0.5' },
    { key: 'per_km', label: 'Then per km (₹)', step: '0.5' },
    { key: 'minimum', label: 'Minimum fare (₹)' },
  ],
  meter: [
    { key: 'base', label: 'Base fare (₹)' },
    { key: 'per_km', label: 'Per km (₹)', step: '0.5' },
    { key: 'per_minute', label: 'Per minute (₹)', step: '0.25' },
    { key: 'minimum', label: 'Minimum fare (₹)' },
  ],
  hourly: [
    { key: 'per_hour', label: 'Per hour (₹)' },
    { key: 'min_hours', label: 'Minimum hours', step: '0.5' },
  ],
  package: [
    { key: 'extra_per_hour', label: 'Extra hour (₹)' },
    { key: 'extra_per_km', label: 'Extra km (₹)', step: '0.5' },
  ],
  per_day: [{ key: 'per_day', label: 'Per day (₹)' }],
  outstation_km: [
    { key: 'per_km', label: 'Per km (₹)', step: '0.5' },
    { key: 'min_km_per_day', label: 'Minimum km per day' },
    { key: 'driver_allowance_per_day', label: 'Driver allowance per day (₹)' },
  ],
};

// Typical trips for the before/after table. Distances and times are what a fleet would quote.
const sampleTrips: { label: string; trip: TripRequest }[] = [
  { label: 'City, 5 km', trip: { trip_type: 'city', distance_km: 5, duration_minutes: 15 } },
  { label: 'City, 15 km', trip: { trip_type: 'city', distance_km: 15, duration_minutes: 40 } },
  { label: 'Airport, 25 km', trip: { trip_type: 'airport', distance_km: 25, duration_minutes: 45 } },
  { label: 'Sightseeing, 6 hr / 60 km', trip: { trip_type: 'sightseeing', hours: 6, distance_km: 60 } },
  { label: 'Outstation, 2 days / 600 km', trip: { trip_type: 'outstation', days: 2, distance_km: 600, driver_stay_required: true } },
];

// Number inputs keep what was typed (so "12." can be typed); the card gets the parsed value.
function NumberField({ label, value, onChange, step = '1', min = 0, max }: {
  label: string; value: number; onChange: (n: number) => void; step?: string; min?: number; max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // Only follow outside changes such as a reset, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div>
      <Label className="text-xs font-medium">{label}</Label>
      <Input
        type="number" inputMode="decimal" step={step} min={min} max={max} value={text}
        className="mt-1 h-9"
        onChange={e => {
          setText(e.target.value);
          const n = e.target.value.trim() === '' ? NaN : Number(e.target.value);
          onChange(n);
        }}
      />
    </div>
  );
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Pickup time for previews: today in India time at the chosen hour.
function previewTime(hour: number) {
  const istNow = new Date(Date.now() + 330 * 60 * 1000);
  return `${istNow.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00+05:30`;
}

export function RateCardEditor() {
  const { org } = useOrg();
  const { data: pricing, isLoading } = useOrgPricing();
  const queryClient = useQueryClient();

  // The saved rate card, or null when the fleet has none. `ready` is false while the database
  // hasn't had the rate-card migration, and the editor then only previews.
  const { data: stored, isLoading: storedLoading } = useQuery({
    queryKey: ['rate_card', org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('org_pricing').select('rate_card' as '*').eq('org_id', org!.id).maybeSingle();
      if (error) return { ready: false, card: null as RateCard | null };
      const row = data as { rate_card?: RateCard | null } | null;
      return { ready: true, card: row?.rate_card ?? null };
    },
  });

  // What customers are charged now: the saved card, or the old rates as a card.
  const current = useMemo(() => stored?.card ?? rateCardFromLegacy(pricing), [stored, pricing]);
  const [draft, setDraft] = useState<RateCard | null>(null);
  useEffect(() => { setDraft(current); }, [current]);

  const [saving, setSaving] = useState(false);
  const [calc, setCalc] = useState({
    trip_type: 'city' as TripType, vehicle_class: '4_seater' as VehicleClass, distance_km: 12, duration_minutes: 30,
    hours: 4, days: 1, hour: 10, return_trip: false, driver_stay_required: false, waiting_minutes: 0,
  });

  if (isLoading || storedLoading || !draft) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const ready = stored?.ready ?? false;
  const problems = rateCardProblems(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(current);

  const setPlan = (type: TripType, plan: FarePlan) => setDraft(d => d && ({ ...d, plans: { ...d.plans, [type]: plan } }));
  const update = (patch: Partial<RateCard>) => setDraft(d => d && ({ ...d, ...patch }));

  const safeQuote = (card: RateCard, trip: TripRequest) => {
    try { return quoteFare(card, trip); } catch { return null; }
  };
  const calcTrip: TripRequest = {
    trip_type: calc.trip_type, vehicle_class: calc.vehicle_class, distance_km: calc.distance_km,
    duration_minutes: calc.duration_minutes, hours: calc.hours, days: calc.days, scheduled_at: previewTime(calc.hour),
    return_trip: calc.return_trip, driver_stay_required: calc.driver_stay_required, waiting_minutes: calc.waiting_minutes,
  };
  const calcQuote = problems.length === 0 ? safeQuote(draft, calcTrip) : null;

  const handleSave = async () => {
    if (!org?.id || !ready || problems.length > 0) return;
    setSaving(true);
    const { error } = await supabase
      .from('org_pricing')
      .upsert({ org_id: org.id, rate_card: draft, updated_at: new Date().toISOString() } as never, { onConflict: 'org_id' });
    setSaving(false);
    if (error) {
      toast.error(`Could not save the rate card: ${error.message}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['rate_card', org.id] });
    await queryClient.invalidateQueries({ queryKey: ['org_pricing', org.id] });
    await queryClient.invalidateQueries({ queryKey: ['fare-quote'] });
    toast('Rate card saved. New bookings use it.');
  };

  return (
    <div className="space-y-4">
      {!ready && (
        <Card className="p-4 rounded-xl border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Preview only</p>
              <p className="mt-1">
                The database hasn't been updated for rate cards yet, so this can't be saved. You can still design a
                rate card and see what it would charge. Saving turns on once migration
                <code className="mx-1 text-xs">20261030000000_rate_cards.sql</code> is applied.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 shadow-card rounded-xl">
        <h2 className="text-sm font-bold mb-1">How each trip type is priced</h2>
        <p className="text-xs text-muted-foreground mb-4">Pick a model for each kind of trip. The fields change with the model.</p>
        <div className="space-y-5">
          {tripTypes.map(type => {
            const plan = draft.plans[type];
            return (
              <div key={type} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{tripTypeLabel[type]}</h3>
                  <select
                    aria-label={`${tripTypeLabel[type]} pricing model`}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={plan.model}
                    onChange={e => setPlan(type, defaultPlan(e.target.value as FareModel))}
                  >
                    {models.map(m => <option key={m} value={m}>{fareModelLabel[m]}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{fareModelHint[plan.model]}</p>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  {planFields[plan.model].map(f => (
                    <NumberField
                      key={f.key}
                      label={f.label}
                      step={f.step}
                      value={(plan as unknown as Record<string, number>)[f.key]}
                      onChange={n => setPlan(type, { ...plan, [f.key]: n } as FarePlan)}
                    />
                  ))}
                </div>
                {plan.model === 'package' && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium">Packages</p>
                    {plan.packages.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                        <NumberField label="Hours" step="0.5" value={p.hours}
                          onChange={n => setPlan(type, { ...plan, packages: plan.packages.map((q, j) => j === i ? { ...q, hours: n } : q) })} />
                        <NumberField label="Km" value={p.km}
                          onChange={n => setPlan(type, { ...plan, packages: plan.packages.map((q, j) => j === i ? { ...q, km: n } : q) })} />
                        <NumberField label="Price (₹)" value={p.price}
                          onChange={n => setPlan(type, { ...plan, packages: plan.packages.map((q, j) => j === i ? { ...q, price: n } : q) })} />
                        <Button variant="ghost" size="icon" aria-label="Remove package"
                          onClick={() => setPlan(type, { ...plan, packages: plan.packages.filter((_, j) => j !== i) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm"
                      onClick={() => setPlan(type, { ...plan, packages: [...plan.packages, { hours: 4, km: 40, price: 1200 }] })}>
                      <Plus className="h-4 w-4 mr-1" /> Add package
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 shadow-card rounded-xl">
        <h2 className="text-sm font-bold mb-1">Car size, returns and stays</h2>
        <p className="text-xs text-muted-foreground mb-4">Multipliers apply to the trip's fare. 1 means no change.</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <NumberField label="4-seater multiplier" step="0.05" min={0.5} max={5} value={draft.vehicle_multipliers['4_seater']}
            onChange={n => update({ vehicle_multipliers: { ...draft.vehicle_multipliers, '4_seater': n } })} />
          <NumberField label="6-seater multiplier" step="0.05" min={0.5} max={5} value={draft.vehicle_multipliers['6_seater']}
            onChange={n => update({ vehicle_multipliers: { ...draft.vehicle_multipliers, '6_seater': n } })} />
          <NumberField label="Return journey multiplier" step="0.1" value={draft.return_multiplier}
            onChange={n => update({ return_multiplier: n })} />
          <NumberField label="Driver night halt (₹/night)" value={draft.night_halt_per_night}
            onChange={n => update({ night_halt_per_night: n })} />
        </div>
      </Card>

      <Card className="p-5 shadow-card rounded-xl">
        <h2 className="text-sm font-bold mb-1">Surcharges</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Added for pickups in a time window (India time) or on a date. If several apply, only the biggest one is added.
        </p>
        <div className="space-y-3">
          {draft.surcharges.map((s, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs font-medium">Name</Label>
                  <Input className="mt-1 h-9" value={s.label}
                    onChange={e => update({ surcharges: draft.surcharges.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove surcharge"
                  onClick={() => update({ surcharges: draft.surcharges.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="Extra %" value={s.pct} max={200}
                  onChange={n => update({ surcharges: draft.surcharges.map((x, j) => j === i ? { ...x, pct: n } : x) })} />
                <NumberField label="From (hour)" value={s.from_hour} max={23}
                  onChange={n => update({ surcharges: draft.surcharges.map((x, j) => j === i ? { ...x, from_hour: n } : x) })} />
                <NumberField label="To (hour)" value={s.to_hour} max={23}
                  onChange={n => update({ surcharges: draft.surcharges.map((x, j) => j === i ? { ...x, to_hour: n } : x) })} />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days the surcharge applies">
                {weekdays.map((name, day) => {
                  const on = !s.days?.length || s.days.includes(day);
                  return (
                    <button
                      key={day} type="button" aria-pressed={on}
                      className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}
                      onClick={() => {
                        const all = s.days?.length ? s.days : [0, 1, 2, 3, 4, 5, 6];
                        const next = on ? all.filter(d => d !== day) : [...all, day].sort();
                        update({ surcharges: draft.surcharges.map((x, j) => j === i ? { ...x, days: next.length === 7 ? [] : next } : x) });
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm"
            onClick={() => update({ surcharges: [...draft.surcharges, { label: 'Evening peak', pct: 20, from_hour: 17, to_hour: 21, days: [1, 2, 3, 4, 5] }] })}>
            <Plus className="h-4 w-4 mr-1" /> Add time surcharge
          </Button>

          {draft.special_dates.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_80px] sm:grid-cols-[1fr_1fr_80px_auto] gap-2 items-end rounded-lg border p-3 sm:border-0 sm:p-0">
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs font-medium">Occasion</Label>
                <Input className="mt-1 h-9" value={d.label}
                  onChange={e => update({ special_dates: draft.special_dates.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs font-medium">Date</Label>
                <Input type="date" className="mt-1 h-9" value={d.date}
                  onChange={e => update({ special_dates: draft.special_dates.map((x, j) => j === i ? { ...x, date: e.target.value } : x) })} />
              </div>
              <NumberField label="Extra %" value={d.pct} max={200}
                onChange={n => update({ special_dates: draft.special_dates.map((x, j) => j === i ? { ...x, pct: n } : x) })} />
              <Button variant="ghost" size="icon" aria-label="Remove date" className="row-start-1 col-start-3 justify-self-end sm:row-auto sm:col-start-auto"
                onClick={() => update({ special_dates: draft.special_dates.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm"
            onClick={() => update({ special_dates: [...draft.special_dates, { label: 'Festival', date: new Date().toISOString().slice(0, 10), pct: 30 }] })}>
            <Plus className="h-4 w-4 mr-1" /> Add date surcharge
          </Button>
        </div>
      </Card>

      <Card className="p-5 shadow-card rounded-xl">
        <h2 className="text-sm font-bold mb-1">Waiting, tax and rounding</h2>
        <p className="text-xs text-muted-foreground mb-4">Waiting is charged on the final fare, after the free minutes.</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <NumberField label="Free waiting (min)" value={draft.waiting_free_minutes} onChange={n => update({ waiting_free_minutes: n })} />
          <NumberField label="Waiting per min (₹)" step="0.5" value={draft.waiting_per_minute} onChange={n => update({ waiting_per_minute: n })} />
          <NumberField label="Tax / GST %" step="0.5" max={50} value={draft.tax_pct} onChange={n => update({ tax_pct: n })} />
          <div>
            <Label className="text-xs font-medium">Round fares to</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.round_to}
              onChange={e => update({ round_to: Number(e.target.value) })}>
              {[1, 5, 10].map(n => <option key={n} value={n}>₹{n}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {problems.length > 0 && (
        <Card className="p-4 rounded-xl border-destructive text-destructive">
          <ul className="text-sm list-disc pl-5 space-y-1">{problems.map(p => <li key={p}>{p}</li>)}</ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {changed && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button variant="outline" onClick={() => setDraft(current)} disabled={!changed || saving}>
          <RotateCcw className="h-4 w-4 mr-2" /> Undo changes
        </Button>
        <Button onClick={handleSave} disabled={!ready || !changed || problems.length > 0 || saving}
          title={ready ? undefined : 'Available once the database is updated for rate cards'}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? 'Saving...' : 'Save rate card'}
        </Button>
      </div>

      <Card className="p-5 shadow-card rounded-xl">
        <h2 className="text-sm font-bold mb-1">Fare calculator</h2>
        <p className="text-xs text-muted-foreground mb-4">Try any trip against the rate card above, saved or not.</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div>
            <Label className="text-xs font-medium">Trip type</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={calc.trip_type}
              onChange={e => setCalc(c => ({ ...c, trip_type: e.target.value as TripType }))}>
              {tripTypes.map(t => <option key={t} value={t}>{tripTypeLabel[t]}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs font-medium">Car size</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={calc.vehicle_class}
              onChange={e => setCalc(c => ({ ...c, vehicle_class: e.target.value as VehicleClass }))}>
              <option value="4_seater">4-seater</option>
              <option value="6_seater">6-seater</option>
            </select>
          </div>
          <NumberField label="Distance (km)" step="0.5" value={calc.distance_km} onChange={n => setCalc(c => ({ ...c, distance_km: n }))} />
          <NumberField label="Duration (min)" value={calc.duration_minutes} onChange={n => setCalc(c => ({ ...c, duration_minutes: n }))} />
          <NumberField label="Hours" step="0.5" value={calc.hours} onChange={n => setCalc(c => ({ ...c, hours: n }))} />
          <NumberField label="Days" value={calc.days} onChange={n => setCalc(c => ({ ...c, days: n }))} />
          <NumberField label="Pickup hour (0-23)" max={23} value={calc.hour} onChange={n => setCalc(c => ({ ...c, hour: Number.isFinite(n) ? n : 10 }))} />
          <NumberField label="Waiting (min)" value={calc.waiting_minutes} onChange={n => setCalc(c => ({ ...c, waiting_minutes: n }))} />
          <label className="flex items-center gap-2 text-xs font-medium col-span-1">
            <Switch checked={calc.return_trip} onCheckedChange={v => setCalc(c => ({ ...c, return_trip: v }))} /> Return journey
          </label>
          <label className="flex items-center gap-2 text-xs font-medium col-span-1">
            <Switch checked={calc.driver_stay_required} onCheckedChange={v => setCalc(c => ({ ...c, driver_stay_required: v }))} /> Driver stays over
          </label>
        </div>

        {calcQuote ? (
          <div className="mt-4 rounded-lg bg-muted/50 p-4">
            <ul className="space-y-1 text-sm">
              {calcQuote.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-4"><span className="text-muted-foreground">{l.label}</span><span>{rupees(l.amount)}</span></li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t flex justify-between font-bold"><span>Total</span><span>{rupees(calcQuote.total)}</span></div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-destructive">Fix the problems above to see a fare.</p>
        )}
      </Card>

      <Card className="p-5 shadow-card rounded-xl">
        <h2 className="text-sm font-bold mb-1">Typical trips: now and with this rate card</h2>
        <p className="text-xs text-muted-foreground mb-4">4-seater, 10 AM pickup. "Now" is what customers are charged today.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Trip</th>
                <th className="pb-2 font-medium text-right">Now</th>
                <th className="pb-2 font-medium text-right">This card</th>
              </tr>
            </thead>
            <tbody>
              {sampleTrips.map(s => {
                const trip = { ...s.trip, scheduled_at: previewTime(10) };
                const before = safeQuote(current, trip)?.total;
                const after = problems.length === 0 ? safeQuote(draft, trip)?.total : undefined;
                const diff = before != null && after != null ? after - before : 0;
                return (
                  <tr key={s.label} className="border-t">
                    <td className="py-2">{s.label}</td>
                    <td className="py-2 text-right">{before == null ? '–' : rupees(before)}</td>
                    <td className={`py-2 text-right font-semibold ${diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-emerald-600' : ''}`}>
                      {after == null ? '–' : rupees(after)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Customer bookings don't carry a distance yet, so distance, meter and per-km plans charge their minimum for them
          until the app measures trips.
        </p>
      </Card>
    </div>
  );
}
