import { Search, Bell, Plus, Zap } from 'lucide-react';
import { useOrg } from '@/hooks/useOrg';
import { useAuth } from '@/hooks/useAuth';
import type { ActiveTab } from './AdminShell';

interface TopHeaderProps {
  activeTab?: ActiveTab;
  onNewBooking?: () => void;
  onTabChange?: (tab: ActiveTab) => void;
}

const subNavItems: { id: ActiveTab; label: string }[] = [
  { id: 'dashboard',   label: 'Overview' },
  { id: 'bookings',    label: 'Bookings' },
  { id: 'drivers',     label: 'Drivers' },
  { id: 'collections', label: 'Collections' },
  { id: 'settings',    label: 'Settings' },
];

export function TopHeader({ activeTab = 'dashboard', onNewBooking, onTabChange }: TopHeaderProps) {
  const { org } = useOrg();
  const { user } = useAuth();

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <header className="fixed top-0 right-0 left-64 z-40 h-20 hidden md:flex items-center justify-between px-8 glass-nav border-b border-slate-100">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search bookings, drivers..."
          className="bg-muted rounded-xl py-3 pl-12 pr-4 w-72 text-sm border-none outline-none focus:ring-2 focus:ring-primary/20 font-label"
        />
      </div>

      {/* Sub-nav */}
      <nav className="flex items-center gap-6">
        {subNavItems.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange?.(id)}
            className={`text-sm font-semibold pb-1 transition-colors ${
              activeTab === id
                ? 'border-b-2 border-accent text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <button type="button" className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={onNewBooking}
          className="kinetic-gradient text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Booking
        </button>
        <div className="w-9 h-9 rounded-full kinetic-gradient flex items-center justify-center text-xs font-bold text-white">
          {initials}
        </div>
      </div>
    </header>
  );
}
