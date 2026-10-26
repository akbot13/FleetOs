import { useState, useEffect } from 'react';
import { CustomerHome } from '@/components/customer/CustomerHome';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminShell } from '@/components/admin/AdminShell';
import { DriverApp } from '@/components/driver/DriverApp';
import { DriverLoginPage } from '@/components/auth/DriverLoginPage';
import { PricingEngine } from '@/components/admin/PricingEngine';
import { LoginPage } from '@/components/auth/LoginPage';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { hasApprovedDriverSession, normalizeAppView, type AppView } from '@/lib/viewAccess';
import { readTrackingTokenFromUrl } from '@/lib/trackingStorage';
import { Car, Settings, DollarSign, LogOut, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

function AccessDenied({
  title,
  description,
  onHome,
  onSignOut,
}: {
  title: string;
  description: string;
  onHome: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-sm mx-auto px-6">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={onHome} className="rounded-full text-xs">
            Back to Customer View
          </Button>
          <Button variant="outline" size="sm" onClick={onSignOut} className="rounded-full text-xs">
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

// The driver row saved at sign-in, so the driver app shows the driver's name and vehicle.
function readStoredDriver() {
  try {
    return JSON.parse(localStorage.getItem('fleetos_driver') ?? 'null');
  } catch {
    return null;
  }
}

const Index = () => {
  const [view, setView] = useState<AppView>(() => {
    if (typeof window === 'undefined') return 'customer';
    // A tracking link is for customers whatever view this browser last used.
    if (readTrackingTokenFromUrl()) return 'customer';
    return normalizeAppView(localStorage.getItem('fleetos_view'));
  });

  // Bumped when a driver signs in so the stored driver session is re-read.
  const [, setDriverSignInCount] = useState(0);
  const { user: authUser, loading, signOut } = useAuth();
  // Drivers sign in on an anonymous session; only real staff accounts count as a signed-in user here.
  const user = authUser && !authUser.is_anonymous ? authUser : null;
  const { isAdmin, isDriver, hasApprovedDriverSession: storedDriverSession, isLoading: roleLoading } = useUserRole();
  const approvedDriverSession = storedDriverSession || hasApprovedDriverSession();
  const canOpenDriverSurface = isDriver || approvedDriverSession;

  const handleSetView = (next: AppView) => {
    if ((next === 'admin' || next === 'pricing') && user && !isAdmin) {
      return;
    }

    if (next === 'driver' && user && !canOpenDriverSurface) {
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('fleetos_view', next);
    }
    setView(next);
  };

  useEffect(() => {
    if (roleLoading) return;
    if (!user) return;

    if (isAdmin) {
      if (view !== 'admin' && view !== 'pricing') {
        setView('admin');
      }
      return;
    }

    if (canOpenDriverSurface) {
      if (view !== 'driver') {
        setView('driver');
      }
      return;
    }

    if (view !== 'customer') {
      setView('customer');
    }
  }, [user, isAdmin, canOpenDriverSurface, roleLoading, view]);

  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if ((view === 'admin' || view === 'pricing') && !user) {
    return (
      <div className="relative min-h-screen">
        <LoginPage onDriverSelect={() => handleSetView('driver')} />
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSetView('customer')}
            className="rounded-full text-xs"
          >
            Back to Customer View
          </Button>
        </div>
      </div>
    );
  }

  if ((view === 'admin' || view === 'pricing') && user && !isAdmin) {
    return (
      <AccessDenied
        title="Access Denied"
        description="You do not have permission to open the admin or pricing surfaces. Contact your fleet manager for access."
        onHome={() => handleSetView('customer')}
        onSignOut={() => signOut()}
      />
    );
  }

  if (view === 'driver' && user && !canOpenDriverSurface) {
    return (
      <AccessDenied
        title="Driver Access Locked"
        description="This account does not have driver access. Use the customer view or sign out and sign in with an approved driver session."
        onHome={() => handleSetView('customer')}
        onSignOut={() => signOut()}
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      {view === 'customer' && <CustomerHome />}
      {view === 'admin' && <AdminShell activeTab="dashboard"><AdminDashboard /></AdminShell>}
      {view === 'driver' && (canOpenDriverSurface
        ? <DriverApp driver={readStoredDriver()} />
        : <DriverLoginPage onSignedIn={() => setDriverSignInCount(c => c + 1)} />)}
      {view === 'pricing' && <PricingEngine />}

      {/* Signed-in drivers have their own Log Out; on admin screens the switcher sits
          at the bottom so it doesn't cover the header nav. */}
      {!(view === 'driver' && canOpenDriverSurface) && (
      <div className={view === 'admin' || view === 'pricing'
        ? 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50'
        : 'fixed top-4 right-4 z-50'}>
        <div className="flex items-center gap-1 bg-primary/95 backdrop-blur-sm rounded-full px-1.5 py-1.5 shadow-elevated">
          {([
            { id: 'customer' as AppView, label: 'Customer', icon: Car, show: true },
            { id: 'driver' as AppView, label: 'Driver', icon: Car, show: !user || canOpenDriverSurface },
            { id: 'admin' as AppView, label: 'Admin', icon: Settings, show: isAdmin },
            { id: 'pricing' as AppView, label: 'Pricing', icon: DollarSign, show: isAdmin },
          ])
            .filter(t => t.show)
            .map(t => (
              <button
                key={t.id}
                onClick={() => handleSetView(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition ${
                  view === t.id ? 'bg-secondary text-secondary-foreground' : 'text-primary-foreground/60 hover:text-primary-foreground'
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          {!user && (
            <button
              data-testid="open-login"
              onClick={() => handleSetView('admin')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-primary-foreground/60 hover:text-primary-foreground transition"
            >
              <Settings className="h-3.5 w-3.5" />
              Login
            </button>
          )}
          {user && (
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-primary-foreground/60 hover:text-primary-foreground transition"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default Index;
