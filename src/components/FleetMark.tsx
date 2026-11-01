import { useEffect, useState } from 'react';
import { monogram } from '@/lib/fleetDisplay';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
} as const;

interface FleetMarkProps {
  name: string | null | undefined;
  logoUrl: string | null | undefined;
  size?: keyof typeof SIZES;
  /** onPrimary sits on the brand colour; onSurface sits on a white or grey surface. */
  tone?: 'onPrimary' | 'onSurface';
  className?: string;
}

/** The fleet's logo, or a monogram of its name when there is no logo (or it fails to load). */
export function FleetMark({ name, logoUrl, size = 'md', tone = 'onPrimary', className }: FleetMarkProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);

  const base = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg', SIZES[size], className);

  if (logoUrl && !broken) {
    return (
      <div className={cn(base, 'bg-white p-1')}>
        <img
          src={logoUrl}
          alt={name ? `${name} logo` : 'Fleet logo'}
          className="h-full w-full object-contain"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  const letters = monogram(name);
  if (!letters) return null;
  return (
    <div
      aria-hidden
      className={cn(
        base,
        'font-semibold tracking-tight',
        tone === 'onPrimary' ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-primary text-primary-foreground',
      )}
    >
      {letters}
    </div>
  );
}
