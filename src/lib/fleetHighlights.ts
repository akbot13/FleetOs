import {
  BadgeCheck, Sparkles, Clock, ReceiptText, Route, Plane, ShieldCheck, CalendarClock,
  type LucideIcon,
} from 'lucide-react';

// What a fleet can promise customers. The owner picks up to MAX_HIGHLIGHTS in Settings and the
// ids are stored in organizations.highlights. The database only accepts these ids.
export const MAX_HIGHLIGHTS = 4;

export type HighlightId =
  | 'verified_drivers'
  | 'clean_cars'
  | 'on_time'
  | 'no_hidden_charges'
  | 'outstation_experts'
  | 'airport_specialists'
  | 'women_friendly'
  | 'twenty_four_seven';

export interface FleetHighlight {
  id: HighlightId;
  label: string;
  icon: LucideIcon;
}

export const FLEET_HIGHLIGHTS: FleetHighlight[] = [
  { id: 'verified_drivers', label: 'Verified drivers', icon: BadgeCheck },
  { id: 'clean_cars', label: 'Clean cars', icon: Sparkles },
  { id: 'on_time', label: 'On-time pickups', icon: Clock },
  { id: 'no_hidden_charges', label: 'No hidden charges', icon: ReceiptText },
  { id: 'outstation_experts', label: 'Outstation experts', icon: Route },
  { id: 'airport_specialists', label: 'Airport specialists', icon: Plane },
  { id: 'women_friendly', label: 'Women-friendly service', icon: ShieldCheck },
  { id: 'twenty_four_seven', label: 'Open 24x7', icon: CalendarClock },
];

const BY_ID = new Map<string, FleetHighlight>(FLEET_HIGHLIGHTS.map(h => [h.id, h]));

/** Highlight definitions for stored ids, in stored order. Unknown ids are dropped. */
export function resolveHighlights(ids: readonly string[] | null | undefined): FleetHighlight[] {
  return (ids ?? []).flatMap(id => {
    const h = BY_ID.get(id);
    return h ? [h] : [];
  });
}
