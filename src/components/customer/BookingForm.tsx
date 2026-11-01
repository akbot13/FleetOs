import { useEffect, useRef, useState } from 'react';
import { Plus, Minus, X, GripVertical, PlaneLanding, PlaneTakeoff, ChevronRight, ChevronDown, AlertCircle, Info, LocateFixed, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationInput } from './LocationInput';
import { TripType } from './TripTypeSelector';
import { TripPreviewMap } from '@/components/maps/TripPreviewMap';
import { cn } from '@/lib/utils';
import type { VehicleClass } from '@/lib/dispatch';
import { validateBooking, firstErrorField, type BookingField } from '@/lib/bookingValidation';
import { FareNote } from './FareEstimate';
import { useFareQuote } from '@/hooks/useFareQuote';
import { olaReverseGeocode } from '@/lib/olaMaps';
import { geoFailureMessage, shouldOpenMore } from '@/lib/customerTrip';

export interface BookingFormData {
  pickup: string;
  drop: string;
  date: string;
  time: string;
  tripType: TripType;
  customerName: string;
  customerPhone: string;
  hubCity: string;
  passengerCount: number;
  vehicleClass: VehicleClass;
  notes: string;
  // Airport
  airportDirection: 'arriving' | 'departing';
  flightNumber: string;
  // City Tour
  estimatedHours: number;
  stops: string[];
  // Intercity
  isRoundTrip: boolean;
  returnDate: string;
  // Multi-day
  numberOfDays: number;
  driverStayRequired: boolean;
}

export const defaultFormData: BookingFormData = {
  pickup: '',
  drop: '',
  date: '',
  time: '',
  tripType: 'local',
  customerName: '',
  customerPhone: '',
  hubCity: 'Jaipur',
  numberOfDays: 1,
  passengerCount: 1,
  vehicleClass: '4_seater',
  notes: '',
  airportDirection: 'arriving',
  flightNumber: '',
  estimatedHours: 4,
  stops: [],
  isRoundTrip: false,
  returnDate: '',
  driverStayRequired: false,
};

interface BookingFormProps {
  data: BookingFormData;
  onChange: (data: BookingFormData) => void;
  onNext: () => void;
  /** True while name and phone come from this device's saved details. */
  detailsPrefilled?: boolean;
  onClearDetails?: () => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

const inputClass = 'h-12 rounded-2xl';
const labelClass = 'mb-1 block text-xs text-muted-foreground';
const chip = (active: boolean) =>
  cn(
    'min-h-[44px] flex-1 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'cu-tint border-primary' : 'border-border bg-card text-muted-foreground',
  );
const stepBtn = 'flex h-12 w-12 items-center justify-center rounded-full border bg-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const CAR_OPTIONS: { id: VehicleClass; label: string; detail: string }[] = [
  { id: '4_seater', label: '4-seater', detail: 'Sedan, up to 4' },
  { id: '6_seater', label: '6-seater', detail: 'SUV, up to 6' },
];

export function BookingForm({ data, onChange, onNext, detailsPrefilled = false, onClearDetails }: BookingFormProps) {
  const formRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [tried, setTried] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // Errors show after the first Next tap, and each one clears as soon as its field is fixed.
  const errors = tried ? validateBooking(data) : {};
  const invalid = 'border-destructive focus-visible:ring-destructive';

  // Optional fields live behind "More options", which opens by itself when one holds a value or an error.
  const optionalError = !!(errors as Record<string, string | undefined>).notes;
  const [moreOpen, setMoreOpen] = useState(() => shouldOpenMore(data, {}));
  useEffect(() => {
    if (optionalError) setMoreOpen(true);
  }, [optionalError]);

  // Each car size shows its own server quote, so customers compare before choosing. Same cached query as before.
  const quote4 = useFareQuote({ ...data, vehicleClass: '4_seater' });
  const quote6 = useFareQuote({ ...data, vehicleClass: '6_seater' });
  const quotes: Record<VehicleClass, typeof quote4> = { '4_seater': quote4, '6_seater': quote6 };
  const selectedQuote = quotes[data.vehicleClass];

  const focusField = (field: BookingField) => {
    // Wait a frame so the error text is in the page before scrolling.
    requestAnimationFrame(() => {
      const box = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      if (!box) return;
      const inputs = box.querySelectorAll<HTMLElement>('input, textarea');
      const target = field === 'when' && data.date ? inputs[1] : inputs[0];
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
    });
  };

  const handleNext = () => {
    const first = firstErrorField(validateBooking(data));
    if (!first) {
      onNext();
      return;
    }
    setTried(true);
    focusField(first);
  };

  const update = (partial: Partial<BookingFormData>) => onChange({ ...data, ...partial });
  // A 4-seater only takes four passengers, so a bigger group is moved to the 6-seater.
  const setPassengers = (count: number) =>
    update({ passengerCount: count, ...(count > 4 ? { vehicleClass: '6_seater' as const } : {}) });
  const needsSixSeater = data.passengerCount > 4;
  const airportTerminal = `${data.hubCity || 'City'} Airport`;
  const previewPickup = data.tripType === 'airport' && data.airportDirection === 'arriving'
    ? airportTerminal
    : data.pickup;
  const previewDrop = data.tripType === 'airport'
    ? data.airportDirection === 'arriving'
      ? data.pickup
      : airportTerminal
    : data.drop;
  const previewStops = data.tripType === 'city_tour'
    ? data.stops.filter(stop => stop.trim().length > 0)
    : [];
  const previewSubtitle = previewDrop || previewStops.length > 0
    ? 'Cab-style route preview with highlighted path'
    : 'Add your destination to see the route update live';

  const addStop = () => {
    if (data.stops.length < 6) update({ stops: [...data.stops, ''] });
  };
  const removeStop = (i: number) => update({ stops: data.stops.filter((_, idx) => idx !== i) });
  const updateStop = (i: number, val: string) => {
    const newStops = [...data.stops];
    newStops[i] = val;
    update({ stops: newStops });
  };

  // Asked only when the customer taps. The form works the same if this fails.
  const fillFromLocation = () => {
    setGeoMessage(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoMessage(geoFailureMessage(2));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const address = await olaReverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        if (address) onChange({ ...dataRef.current, pickup: address });
        else setGeoMessage("Found you, but couldn't read the address. Type your pickup instead.");
      },
      (err) => {
        setLocating(false);
        setGeoMessage(geoFailureMessage(err.code));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const now = new Date();
  now.setMinutes(now.getMinutes() + 15);
  const minDate = now.toISOString().split('T')[0];

  return (
    <div ref={formRef} className="animate-slide-up space-y-4">
      <div className="cu-card space-y-4 p-5">
        {/* Common: Pickup */}
        <div data-field="pickup">
          <LocationInput
            value={data.pickup}
            onChange={(v) => update({ pickup: v })}
            placeholder={data.tripType === 'airport' ? 'Your address' : 'Pickup location'}
            icon="pickup"
          />
          <button
            type="button"
            onClick={fillFromLocation}
            disabled={locating}
            className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm font-semibold text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
            {locating ? 'Finding you' : 'Use my location'}
          </button>
          {geoMessage && (
            <p role="status" className="flex items-start gap-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {geoMessage}
            </p>
          )}
          <FieldError id="err-pickup" message={errors.pickup} />
        </div>

        {/* Airport-specific */}
        {data.tripType === 'airport' && (
          <>
            <div className="flex gap-2">
              {(['arriving', 'departing'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  aria-pressed={data.airportDirection === dir}
                  onClick={() => update({ airportDirection: dir })}
                  className={cn(chip(data.airportDirection === dir), 'flex items-center justify-center gap-2 text-xs')}
                >
                  {dir === 'arriving' ? <PlaneLanding className="h-4 w-4 shrink-0" aria-hidden /> : <PlaneTakeoff className="h-4 w-4 shrink-0" aria-hidden />}
                  {dir === 'arriving' ? `Arriving in ${data.hubCity || 'your city'}` : `Departing from ${data.hubCity || 'your city'}`}
                </button>
              ))}
            </div>
            <Input
              value={`${data.hubCity || 'City'} Airport`}
              disabled
              className={cn(inputClass, 'bg-muted text-sm')}
            />
          </>
        )}

        {/* Drop (local, intercity, multiday) */}
        {['local', 'intercity', 'multiday'].includes(data.tripType) && (
          <div data-field="drop">
            <LocationInput
              value={data.drop}
              onChange={(v) => update({ drop: v })}
              placeholder={data.tripType === 'local' ? 'Drop location' : 'Destination city'}
              icon="drop"
            />
            <FieldError id="err-drop" message={errors.drop} />
          </div>
        )}

        {/* City Tour: stops */}
        {data.tripType === 'city_tour' && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Stops</p>
            {data.stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                <Input
                  placeholder={`Stop ${i + 1}`}
                  value={stop}
                  onChange={(e) => updateStop(i, e.target.value)}
                  className={cn(inputClass, 'text-sm')}
                />
                <button type="button" onClick={() => removeStop(i)} aria-label={`Remove stop ${i + 1}`} className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}
            {data.stops.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={addStop} className="h-11 w-full rounded-full text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add stop
              </Button>
            )}
          </div>
        )}

        {/* City Tour: hours */}
        {data.tripType === 'city_tour' && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Estimated hours</p>
            <div className="flex gap-2">
              {[4, 6, 8, 10].map((h) => (
                <button key={h} type="button" onClick={() => update({ estimatedHours: h })} className={chip(data.estimatedHours === h)}>
                  {h}h
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Outstation / intercity: number of days */}
        {data.tripType === 'intercity' && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Number of days</p>
            <div className="flex items-center gap-4">
              <button type="button" aria-label="Fewer days" onClick={() => update({ numberOfDays: Math.max(1, data.numberOfDays - 1) })} className={stepBtn}>
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="cu-serif w-8 text-center text-2xl">{data.numberOfDays}</span>
              <button type="button" aria-label="More days" onClick={() => update({ numberOfDays: Math.min(30, data.numberOfDays + 1) })} className={stepBtn}>
                <Plus className="h-4 w-4" aria-hidden />
              </button>
              <span className="text-xs text-muted-foreground">{data.numberOfDays} day{data.numberOfDays > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Intercity: round trip toggle */}
        {data.tripType === 'intercity' && (
          <div className="flex gap-2">
            <button type="button" aria-pressed={!data.isRoundTrip} onClick={() => update({ isRoundTrip: false })} className={chip(!data.isRoundTrip)}>
              One way
            </button>
            <button type="button" aria-pressed={data.isRoundTrip} onClick={() => update({ isRoundTrip: true })} className={chip(data.isRoundTrip)}>
              Round trip
            </button>
          </div>
        )}

        {/* Return date for intercity round trip */}
        {data.tripType === 'intercity' && data.isRoundTrip && (
          <div>
            <label className={labelClass}>Return date</label>
            <Input
              type="date"
              value={data.returnDate}
              onChange={(e) => update({ returnDate: e.target.value })}
              className={inputClass}
            />
          </div>
        )}

        {/* Multi-day specifics */}
        {data.tripType === 'multiday' && (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Number of days</p>
              <div className="flex items-center gap-4">
                <button type="button" aria-label="Fewer days" onClick={() => update({ numberOfDays: Math.max(1, data.numberOfDays - 1) })} className={stepBtn}>
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="cu-serif w-8 text-center text-2xl">{data.numberOfDays}</span>
                <button type="button" aria-label="More days" onClick={() => update({ numberOfDays: Math.min(14, data.numberOfDays + 1) })} className={stepBtn}>
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground">{data.numberOfDays} day{data.numberOfDays > 1 ? 's' : ''}</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Driver needs accommodation?</p>
              <div className="flex gap-2">
                {[false, true].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    aria-pressed={data.driverStayRequired === val}
                    onClick={() => update({ driverStayRequired: val })}
                    className={chip(data.driverStayRequired === val)}
                  >
                    {val ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Date + Time */}
        <div data-field="when">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Date</label>
              <Input
                type="date"
                value={data.date}
                min={minDate}
                placeholder={minDate}
                aria-invalid={!!errors.when}
                aria-describedby={errors.when ? 'err-when' : undefined}
                onChange={(e) => update({ date: e.target.value })}
                className={cn(inputClass, errors.when && invalid)}
              />
            </div>
            <div>
              <label className={labelClass}>
                {data.tripType === 'airport' ? 'Flight time' : 'Pickup time'}
              </label>
              <Input
                type="time"
                value={data.time}
                aria-invalid={!!errors.when}
                aria-describedby={errors.when ? 'err-when' : undefined}
                onChange={(e) => update({ time: e.target.value })}
                className={cn(inputClass, errors.when && invalid)}
              />
            </div>
          </div>
          <FieldError id="err-when" message={errors.when} />
        </div>
        {data.date && data.time && (
          <p className="-mt-2 text-xs text-muted-foreground">
            {new Date(`${data.date}T${data.time}`).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </p>
        )}
      </div>

      <TripPreviewMap
        pickup={previewPickup}
        drop={previewDrop}
        stops={previewStops}
        title="Trip map"
        subtitle={previewSubtitle}
        mapClassName="h-[220px]"
      />

      {/* Customer details */}
      <div className="cu-card space-y-3 p-5">
        <div data-field="name">
          <label className={labelClass}>Your name</label>
          <Input
            placeholder="Full name"
            value={data.customerName}
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'err-name' : undefined}
            onChange={(e) => update({ customerName: e.target.value })}
            className={cn(inputClass, errors.name && invalid)}
          />
          <FieldError id="err-name" message={errors.name} />
        </div>
        <div data-field="phone">
          <label className={labelClass}>Mobile number</label>
          <div className="flex gap-2">
            <div className="flex items-center justify-center rounded-2xl border bg-muted px-3 text-sm font-medium text-muted-foreground">
              +91
            </div>
            <Input
              type="tel"
              maxLength={10}
              placeholder="9876543210"
              value={data.customerPhone}
              inputMode="numeric"
              autoComplete="tel-national"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'err-phone' : undefined}
              onChange={(e) => update({ customerPhone: e.target.value.replace(/\D/g, '') })}
              className={cn(inputClass, errors.phone && invalid)}
            />
          </div>
          <FieldError id="err-phone" message={errors.phone} />
        </div>
        {detailsPrefilled && onClearDetails && (
          <button
            type="button"
            onClick={onClearDetails}
            className="min-h-[44px] text-xs text-muted-foreground underline underline-offset-2"
          >
            Not you? Clear details
          </button>
        )}
      </div>

      {/* Car size: each tile shows its own live fare */}
      <div>
        <p className="mb-2 text-sm font-semibold">Car size</p>
        <div className="grid grid-cols-2 gap-3">
          {CAR_OPTIONS.map(option => {
            const q = quotes[option.id];
            const active = data.vehicleClass === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                disabled={option.id === '4_seater' && needsSixSeater}
                onClick={() => update({ vehicleClass: option.id })}
                className={cn(
                  'cu-card p-4 text-left transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'cu-tint border-primary' : 'hover:border-primary/40',
                )}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.detail}</p>
                <div className="mt-3 min-h-[32px]">
                  {q.fare !== undefined ? (
                    <span className="cu-serif text-2xl">{`₹${q.fare.toLocaleString('en-IN')}`}</span>
                  ) : q.isError ? (
                    <span className="text-xs text-muted-foreground">Fare unavailable</span>
                  ) : (
                    <span
                      className="block h-7 w-20 animate-pulse rounded-md bg-muted"
                      role={q.isLoading ? 'status' : undefined}
                      aria-label={q.isLoading ? 'Loading fare' : undefined}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {needsSixSeater && (
          <p className="mt-2 text-xs text-muted-foreground">6-seater needed for 5+ passengers</p>
        )}
      </div>

      {/* More options */}
      <div className="cu-card">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="more-options"
          onClick={() => setMoreOpen(o => !o)}
          className="flex min-h-[56px] w-full items-center justify-between px-5 text-sm font-semibold"
        >
          More options
          <ChevronDown className={cn('h-5 w-5 transition-transform', moreOpen && 'rotate-180')} aria-hidden />
        </button>
        {moreOpen && (
          <div id="more-options" className="space-y-4 px-5 pb-5">
            <div>
              <label className={labelClass}>Number of passengers</label>
              <div className="flex items-center gap-4">
                <button type="button" aria-label="Fewer passengers" onClick={() => setPassengers(Math.max(1, data.passengerCount - 1))} className={stepBtn}>
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="cu-serif w-6 text-center text-2xl">{data.passengerCount}</span>
                <button type="button" aria-label="More passengers" onClick={() => setPassengers(Math.min(6, data.passengerCount + 1))} className={stepBtn}>
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground">
                  {data.passengerCount === 1 ? '1 person' : `${data.passengerCount} people`}
                </span>
              </div>
            </div>
            {data.tripType === 'airport' && (
              <div>
                <label className={labelClass}>Flight number <span className="opacity-60">(optional)</span></label>
                <Input
                  placeholder="Flight number"
                  value={data.flightNumber}
                  onChange={(e) => update({ flightNumber: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Instructions for driver <span className="opacity-60">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="e.g. Call on arrival, extra luggage, AC preferred..."
                value={data.notes}
                onChange={(e) => update({ notes: e.target.value })}
                className="w-full resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}
      </div>

      {/* Sticky bar: fare on the left, Next on the right */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-[hsl(var(--cu-page))] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-md px-6 py-3">
          {noteOpen && (
            <div id="fare-note" className="mb-2 rounded-2xl bg-muted/60 px-4 py-2">
              <FareNote tripType={data.tripType} />
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Estimated fare</p>
              <div className="flex items-center gap-1">
                {selectedQuote.fare !== undefined ? (
                  <span className="cu-serif text-3xl">{`₹${selectedQuote.fare.toLocaleString('en-IN')}`}</span>
                ) : selectedQuote.isError ? (
                  <span className="text-sm font-semibold text-muted-foreground">Fare unavailable</span>
                ) : (
                  <span className="block h-8 w-24 animate-pulse rounded-md bg-muted" />
                )}
                <button
                  type="button"
                  aria-label="About this estimate"
                  aria-expanded={noteOpen}
                  aria-controls="fare-note"
                  onClick={() => setNoteOpen(o => !o)}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
                >
                  <Info className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleNext}
              className="h-12 shrink-0 rounded-full px-6 text-base font-semibold"
            >
              Next
              <ChevronRight className="ml-1 h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
