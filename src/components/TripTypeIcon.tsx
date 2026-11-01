import { tripTypeIcon } from '@/lib/tripTypeIcons';
import { cn } from '@/lib/utils';

/** The icon for a trip type (database value or booking form id). Decorative: pair it with a text label. */
export function TripTypeIcon({ type, className }: { type: string | null | undefined; className?: string }) {
  const Icon = tripTypeIcon(type);
  return <Icon aria-hidden className={cn('h-4 w-4 shrink-0', className)} />;
}
