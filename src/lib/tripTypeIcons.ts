import { Car, Plane, Landmark, Route, Map as MapIcon, CalendarDays, type LucideIcon } from 'lucide-react';

// Icons for trip types, in place of emoji. Two vocabularies exist: the database values
// (city, airport, sightseeing, outstation) and the booking form ids (local, city_tour, intercity, multiday).
export const tripTypeIcons: Record<string, LucideIcon> = {
  city: Car,
  airport: Plane,
  sightseeing: Landmark,
  outstation: Route,
  local: Car,
  city_tour: MapIcon,
  intercity: Route,
  multiday: CalendarDays,
};

export function tripTypeIcon(type: string | null | undefined): LucideIcon {
  return tripTypeIcons[type ?? ''] ?? Car;
}
