import { useState, useEffect, type ReactNode } from 'react';
import { AlertCircle, Clock, ChevronLeft, Loader2 } from 'lucide-react';
import { FleetMark } from '@/components/FleetMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { DriverApp } from '@/components/driver/DriverApp';
import { useOrg } from '@/hooks/useOrg';
import type { SupabaseDriver } from '@/hooks/useSupabaseData';

// The driver row the app is opened with: the sign-in reply, or the row re-read on reopening.
type FoundDriver = Pick<SupabaseDriver, 'id' | 'name' | 'status'> & Partial<SupabaseDriver>;

type Screen = 'phone' | 'pin' | 'register' | 'holding' | 'app';

const isActive = (status: string | null | undefined) => status === 'free' || status === 'on-trip';

export function DriverLoginPage({ onSignedIn, onBack }: { onSignedIn?: () => void; onBack?: () => void } = {}) {
  const [screen, setScreen] = useState<Screen>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [driverName, setDriverName] = useState('');
  const [foundDriver, setFoundDriver] = useState<FoundDriver | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { org } = useOrg();

  useEffect(() => {
    const savedDriver = localStorage.getItem('fleetos_driver');
    const savedScreen = localStorage.getItem('fleetos_driver_screen');
    if (!savedDriver || !savedScreen) return;
    const parsed = JSON.parse(savedDriver);

    // Re-read the driver with the signed-in session: the admin may have approved, changed
    // the PIN (which signs the driver out) or removed them.
    supabase
      .from('drivers')
      .select('id, org_id, name, phone, vehicle_model, plate_number, status, is_temporary, odometer_required')
      .eq('id', parsed.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          localStorage.removeItem('fleetos_driver');
          localStorage.removeItem('fleetos_driver_screen');
          return;
        }
        const freshScreen: Screen = isActive(data.status) ? 'app' : 'holding';
        localStorage.setItem('fleetos_driver', JSON.stringify(data));
        localStorage.setItem('fleetos_driver_screen', freshScreen);
        setFoundDriver(data);
        setScreen(freshScreen);
      });
  }, []);

  // Drivers sign in with phone + PIN on top of an anonymous session; the database links the
  // session to the driver only when the PIN matches.
  const ensureSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      setError("Driver sign-in isn't switched on yet. Ask your fleet manager.");
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    setError(null);
    if (!org) {
      setError('Fleet details are still loading. Try again in a moment.');
      return;
    }
    setScreen('pin');
  };

  const handleVerify = async () => {
    setError(null);
    if (pin.length < 6) {
      setError('Enter your 6-digit PIN');
      return;
    }
    setLoading(true);
    if (!(await ensureSession())) { setLoading(false); return; }
    const { data: rows, error: signInError } = await supabase.rpc('driver_sign_in', {
      p_org_id: org!.id, p_phone: phone, p_pin: pin,
    });
    setLoading(false);
    const result = rows?.[0];
    if (signInError || !result?.ok) {
      setError(result?.message ?? "Couldn't sign in. Try again.");
      setPin('');
      return;
    }
    // driver_sign_in() returns the driver's row (without its session link).
    const driver = result.driver as unknown as FoundDriver;
    const next: Screen = isActive(driver.status) ? 'app' : 'holding';
    localStorage.setItem('fleetos_driver', JSON.stringify(driver));
    localStorage.setItem('fleetos_driver_screen', next);
    setFoundDriver(driver);
    setScreen(next);
    if (next === 'app') onSignedIn?.();
  };

  const handleRegister = async () => {
    setError(null);
    if (!org) {
      setError('Fleet details are still loading. Try again in a moment.');
      return;
    }
    setLoading(true);
    const { data: rows, error: registerError } = await supabase.rpc('register_driver', {
      p_org_id: org.id, p_phone: phone, p_name: driverName,
    });
    setLoading(false);
    const result = rows?.[0];
    if (registerError || !result?.ok) {
      setError(result?.message ?? "Couldn't submit your details. Ask your fleet manager to add you.");
      return;
    }
    setScreen('holding');
  };

  if (screen === 'app') {
    return <DriverApp driver={foundDriver} />;
  }

  const brandName = org?.brand_name?.trim() || null;

  // Every step shares one frame: the fleet's mark and name on top, then the step.
  const frame = (children: ReactNode) => (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <FleetMark name={brandName} logoUrl={org?.brand_logo_url} size="lg" tone="onSurface" />
          {brandName && <p className="text-base font-semibold text-foreground">{brandName}</p>}
        </div>
        <div className="bg-card rounded-xl border shadow-card p-6">{children}</div>
        {onBack && screen === 'phone' && (
          <button
            onClick={onBack}
            className="mt-4 mx-auto flex min-h-[44px] items-center gap-1 px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to booking
          </button>
        )}
      </div>
    </div>
  );

  const errorLine = error && (
    <p role="alert" className="mb-4 flex items-start gap-2 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <span>{error}</span>
    </p>
  );

  const backButton = (onClick: () => void) => (
    <button
      className="-ml-3 mb-4 flex min-h-[44px] items-center gap-1 px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      onClick={onClick}
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  );

  if (screen === 'holding') {
    return frame(
      <div className="text-center">
        <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-4" aria-hidden />
        <h1 className="text-xl font-semibold mb-2">Application under review</h1>
        <p className="text-sm text-muted-foreground">
          Your details are with the fleet manager. You can sign in once you are approved.
        </p>
      </div>
    );
  }

  if (screen === 'phone') {
    return frame(
      <>
        <h1 className="text-xl font-semibold">Driver login</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Enter your registered mobile number</p>

        <div className="flex gap-2 mb-4">
          <div className="flex h-12 items-center justify-center px-3 bg-muted rounded-md text-sm font-medium text-muted-foreground border">
            +91
          </div>
          <Input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder="9876543210"
            aria-label="Mobile number"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            className="h-12"
          />
        </div>

        {errorLine}

        <Button className="w-full h-12 rounded-xl font-semibold" disabled={loading || phone.length !== 10} onClick={handleContinue}>
          Continue
        </Button>
      </>
    );
  }

  if (screen === 'register') {
    return frame(
      <>
        {backButton(() => { setScreen('pin'); setError(null); })}
        <h1 className="text-xl font-semibold">Join this fleet</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Your fleet manager approves you and gives you a PIN for +91 ••••••{phone.slice(-4)}.
        </p>
        <div className="mb-4">
          <Label htmlFor="driverName" className="text-sm text-muted-foreground">Full name</Label>
          <Input
            id="driverName"
            placeholder="e.g. Ramesh Kumar"
            value={driverName}
            onChange={e => setDriverName(e.target.value)}
            className="h-12 mt-1"
          />
        </div>
        {errorLine}
        <Button className="w-full h-12 rounded-xl font-semibold" disabled={loading || !driverName.trim()} onClick={handleRegister}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Register
        </Button>
      </>
    );
  }

  // screen === 'pin'
  return frame(
    <>
      {backButton(() => { setScreen('phone'); setPin(''); setError(null); })}
      <h1 className="text-xl font-semibold">Enter your PIN</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        6-digit PIN from your fleet manager for +91 ••••••{phone.slice(-4)}
      </p>

      <div className="flex justify-center mb-4">
        <InputOTP maxLength={6} value={pin} onChange={setPin} inputMode="numeric">
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <InputOTPSlot key={i} index={i} className="h-12 w-11" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {errorLine}

      <Button className="w-full h-12 rounded-xl font-semibold mb-2" onClick={handleVerify} disabled={loading || pin.length < 6}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Sign in
      </Button>

      <button
        className="w-full min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => { setScreen('register'); setError(null); }}
      >
        New driver? Register to join this fleet
      </button>
    </>
  );
}
