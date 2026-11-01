import { tripTypeIcon } from '@/lib/tripTypeIcons';
import { cn } from '@/lib/utils';

export type TripType = 'local' | 'airport' | 'city_tour' | 'intercity' | 'multiday';

interface TripTypeSelectorProps {
  selected: TripType | null;
  onSelect: (type: TripType) => void;
  compact?: boolean;
}

const tripTypes: { id: TripType; label: string; desc: string }[] = [
  { id: 'local', label: 'Local drop', desc: 'Point to point' },
  { id: 'airport', label: 'Airport', desc: 'To or from the airport' },
  { id: 'city_tour', label: 'City tour', desc: 'Multi-stop day' },
  { id: 'intercity', label: 'Intercity', desc: 'One way or return' },
  { id: 'multiday', label: 'Multi-day', desc: 'Several days away' },
];

export const tripTypeConfig = tripTypes;

export function TripTypeSelector({ selected, onSelect, compact = false }: TripTypeSelectorProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', compact && 'gap-2')}>
      {tripTypes.map(t => {
        const isActive = selected === t.id;
        const wide = t.id === 'local' && !compact;
        const Icon = tripTypeIcon(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={isActive}
            className={cn(
              'cu-card flex min-h-[44px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact ? 'items-center gap-2 p-3' : wide ? 'items-center gap-4 p-5' : 'flex-col justify-between gap-6 p-5',
              wide && 'col-span-2',
              isActive ? 'cu-tint border-primary' : 'hover:border-primary/40',
            )}
          >
            <span className={cn('cu-icon-btn bg-primary text-primary-foreground', compact && '!h-10 !w-10')}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn('cu-serif block', compact ? 'text-sm' : 'text-xl')}>{t.label}</span>
              {!compact && <span className="mt-1 block text-sm text-muted-foreground">{t.desc}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
