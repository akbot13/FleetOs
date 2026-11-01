import { BookOpen, BarChart2, LayoutDashboard, LogOut, Plus, Settings, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';
import { cn } from '@/lib/utils';
import type { ActiveTab } from './AdminShell';

interface MobileNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNewBooking: () => void;
}

const items: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: BookOpen },
  { id: 'drivers', label: 'Drivers', icon: Users },
  { id: 'collections', label: 'Collections', icon: BarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Phone-width replacement for the sidebar and top header, which are hidden below the md breakpoint.
export function MobileNav({ activeTab, onTabChange, onNewBooking }: MobileNavProps) {
  const { org } = useOrg();
  const { signOut } = useAuth();
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-card md:hidden">
      <div className="flex h-12 items-center justify-between gap-2 px-4">
        <p className="truncate font-display text-base font-bold text-foreground">{org?.brand_name ?? 'FleetOs'}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onNewBooking} aria-label="New booking"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground hover:bg-muted">
            <Plus className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => signOut()} aria-label="Sign out"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Admin sections">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            className={cn(
              'flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold',
              activeTab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
