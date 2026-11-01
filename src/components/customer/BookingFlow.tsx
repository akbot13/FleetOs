import { useEffect, useState } from 'react';
import { useOrg } from '@/hooks/useOrg';
import { readSavedCustomer, clearSavedCustomer } from '@/lib/savedCustomer';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TripTypeSelector, TripType } from './TripTypeSelector';
import { BookingForm, BookingFormData, defaultFormData } from './BookingForm';
import { BookingSummary } from './BookingSummary';

interface BookingFlowProps {
  onBack: () => void;
  initialData?: { pickup?: string | null; drop?: string | null; trip_type?: string | null; fare?: number | null } | null;
}

type Step = 'type' | 'form' | 'summary';

const stepLabels: Record<Step, string> = {
  type: 'Trip type',
  form: 'Trip details',
  summary: 'Review and confirm',
};

// Maps DB trip_type values to BookingForm TripType
const dbTypeToTripType: Record<string, TripType> = {
  city: 'local',
  airport: 'airport',
  outstation: 'intercity',
  sightseeing: 'city_tour',
};

function buildInitialFormData(initialData: BookingFlowProps['initialData']): BookingFormData {
  if (!initialData) return defaultFormData;
  const tripType: TripType = dbTypeToTripType[initialData.trip_type ?? ''] ?? 'local';
  return {
    ...defaultFormData,
    tripType,
    pickup: initialData.pickup ?? '',
    drop: initialData.drop ?? '',
  };
}

export function BookingFlow({ onBack, initialData }: BookingFlowProps) {
  const [step, setStep] = useState<Step>(initialData ? 'form' : 'type');
const [formData, setFormData] = useState<BookingFormData>(() => {
    const base = buildInitialFormData(initialData);
    if (!base.date && !base.time) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 15);
      base.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      base.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    return base;
  });
  const { org } = useOrg();
  const [detailsPrefilled, setDetailsPrefilled] = useState(false);

  // Fill name and phone from this device once the fleet is known, unless the customer has typed.
  useEffect(() => {
    const saved = readSavedCustomer(org?.id);
    if (!saved) return;
    setFormData(prev => (prev.customerName || prev.customerPhone)
      ? prev
      : { ...prev, customerName: saved.name, customerPhone: saved.phone });
    setDetailsPrefilled(true);
  }, [org?.id]);

  const clearDetails = () => {
    clearSavedCustomer(org?.id);
    setFormData(prev => ({ ...prev, customerName: '', customerPhone: '' }));
    setDetailsPrefilled(false);
  };
 const handleTypeSelect = (type: TripType) => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setFormData({
      ...defaultFormData,
      tripType: type,
      customerName: formData.customerName,
      customerPhone: formData.customerPhone,
      date: localDate,
      time: localTime,
    });
    setStep('form');
  };

  const stepIndex = step === 'type' ? 0 : step === 'form' ? 1 : 2;

  return (
    <div className="customer-ui min-h-screen">
      <header className="mx-auto max-w-md px-6 pt-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              if (step === 'type') onBack();
              else if (step === 'form') setStep('type');
              else setStep('form');
            }}
            className="cu-icon-btn cu-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex items-center gap-2" role="img" aria-label={`Step ${stepIndex + 1} of 3`}>
            {[0, 1, 2].map(i => (
              <span
                key={i}
                aria-hidden
                className={cn('h-2.5 rounded-full transition-all', i === stepIndex ? 'w-6 bg-primary' : i < stepIndex ? 'w-2.5 bg-primary/60' : 'w-2.5 bg-primary/20')}
              />
            ))}
          </div>
          <span className="w-12" aria-hidden />
        </div>
        <h1 className="cu-serif mt-6 text-4xl">{stepLabels[step]}</h1>
      </header>

      <div className="mx-auto max-w-md px-6 pb-32 pt-6">
        {step === 'type' && (
          <div className="animate-slide-up">
            <TripTypeSelector selected={formData.tripType} onSelect={handleTypeSelect} />
          </div>
        )}

        {step === 'form' && (
          <BookingForm
            data={formData}
            onChange={setFormData}
            onNext={() => setStep('summary')}
            detailsPrefilled={detailsPrefilled}
            onClearDetails={clearDetails}
          />
        )}

        {step === 'summary' && (
          <BookingSummary
            data={formData}
            onEdit={() => setStep('form')}
            onDone={onBack}
          />
        )}
      </div>
    </div>
  );
}
