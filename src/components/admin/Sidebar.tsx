import { Zap, LayoutDashboard, BookOpen, Users, BarChart2, Settings, Plus, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';
import type { ActiveTab } from './AdminShell';

interface SidebarProps {
  activeTab?: ActiveTab;
  onNewBooking?: () => void;
  onTabChange?: (tab: ActiveTab) => void;
}

const navItems: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'bookings',    label: 'Bookings',     icon: BookOpen },
  { id: 'drivers',     label: 'Drivers',      icon: Users },
  { id: 'collections', label: 'Collections',  icon: BarChart2 },
  { id: 'settings',    label: 'Settings',     icon: Settings },
];

export function Sidebar({ activeTab = 'dashboard', onNewBooking, onTabChange }: SidebarProps) {
  const { signOut } = useAuth();
  const { org } = useOrg();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 hidden md:flex flex-col py-8 z-50 bg-sidebar border-r border-sidebar-border">
      {/* Brand block */}
      <div className="px-6 mb-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 kinetic-gradient rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-display font-black text-xl tracking-tighter text-sidebar-foreground leading-none">
              FleetOs
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 leading-none mt-0.5">
              Fleet Management
            </p>
          </div>
        </div>
        {org?.brand_name && org.brand_name !== 'FleetOs' && (
          <p className="text-xs text-sidebar-foreground/50 mt-3 pl-1">{org.brand_name}</p>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange?.(id)}
              className={`w-full flex items-center gap-3 py-3 rounded-xl text-sm font-semibold transition-all ${
                isActive
                  ? 'border-l-4 border-accent pl-4 bg-white/10 text-white'
                  : 'pl-5 text-sidebar-foreground/60 hover:bg-white/10 hover:text-sidebar-foreground'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* New Dispatch CTA */}
      <div className="px-4 mb-6">
        <button
          type="button"
          onClick={onNewBooking}
          className="w-full kinetic-gradient text-white py-4 rounded-xl font-bold font-display flex items-center justify-center gap-2 shadow-elevated hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Dispatch
        </button>
      </div>

      {/* Bottom links */}
      <div className="px-4 space-y-1">
        <button type="button" className="w-full flex items-center gap-3 py-2.5 pl-3 rounded-xl text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          <HelpCircle className="h-4 w-4" />
          Support
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full flex items-center gap-3 py-2.5 pl-3 rounded-xl text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
