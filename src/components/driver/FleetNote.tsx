import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { dismissDriverNote, driverNoteHash, hasDriverNote, isDriverNoteDismissed } from '@/lib/driverNote';
import { cn } from '@/lib/utils';

interface FleetNoteProps {
  brandName: string;
  note: string | null | undefined;
  rules: string | null | undefined;
}

/**
 * "From <fleet>": the owner's welcome note and rules. Open until the driver dismisses it, then
 * collapsed to one line. It opens again on its own when the owner changes the content.
 */
export function FleetNote({ brandName, note, rules }: FleetNoteProps) {
  const hash = driverNoteHash(note, rules);
  const [open, setOpen] = useState(() => !isDriverNoteDismissed(hash));

  // New content from the owner (or content arriving after the first render) reopens the block.
  useEffect(() => {
    setOpen(!isDriverNoteDismissed(hash));
  }, [hash]);

  if (!hasDriverNote(note, rules)) return null;

  const collapse = () => {
    dismissDriverNote(hash);
    setOpen(false);
  };

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900">
      <button
        type="button"
        onClick={() => (open ? collapse() : setOpen(true))}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 text-left"
      >
        <span className="text-sm font-semibold text-white truncate">From {brandName}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 px-4 pb-4">
          {note?.trim() && <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-line">{note.trim()}</p>}
          {rules?.trim() && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Rules</p>
              <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-line">{rules.trim()}</p>
            </div>
          )}
          <button
            type="button"
            onClick={collapse}
            className="min-h-[44px] w-full rounded-xl border border-gray-700 text-sm font-semibold text-gray-200 active:scale-95 transition-all"
          >
            Got it
          </button>
        </div>
      )}
    </section>
  );
}
