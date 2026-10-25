import { useState, useEffect } from 'react';
import { Car, Clock, ChevronLeft, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { DriverApp } from '@/components/driver/DriverApp';
import { useOrg } from '@/hooks/useOrg';

type Screen = 'phone' | 'pin' | 'register' | 'holding' | 'app';

const isActive = (status: string | null | undefined) => status === 'free' || status === 'on-trip';

export function DriverLoginPage({ onSignedIn }: { onSignedIn?: () => void } = {}) {
  const [screen, setScreen] = useState<Screen>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [driverName, setDriverName] = useState('');
  const [foundDriver, setFoundDriver] = useState<any>(null);
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
    (supabase as any)
      .from('drivers')
      .select('id, org_id, name, phone, vehicle_model, plate_number, status, is_temporary, odometer_required')
      .eq('id', parsed.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
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
    const { data: rows, error: signInError } = await (supabase as any).rpc('driver_sign_in', {
      p_org_id: org!.id, p_phone: phone, p_pin: pin,
    });
    setLoading(false);
    const result = rows?.[0];
    if (signInError || !result?.ok) {
      setError(result?.message ?? "Couldn't sign in. Try again.");
      setPin('');
      return;
    }
    const driver = result.driver;
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
    const { data: rows, error: registerError } = await (supabase as any).rpc('register_driver', {
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

  if (screen === 'holding') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Clock className="h-16 w-16 text-muted-foreground mb-6" />
        <h2 className="text-xl font-bold mb-2">Application Under Review</h2>
        <p className="text-sm text-muted-foreground max-w-xs mb-4">
          Your details have been submitted to the fleet manager. You will be added once approved.
        </p>
        <p className="text-xs text-muted-foreground">
          For help, contact your fleet manager directly.
        </p>
      </div>
    );
  }

  if (screen === 'phone') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-card rounded-[2rem] shadow-elevated p-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 kinetic-gradient rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-elevated">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-display font-black tracking-tighter text-foreground">Driver Login</h1>
            <p className="text-sm text-muted-foreground mt-1 font-label">
              Enter your registered mobile number
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="flex items-center justify-center px-3 bg-muted rounded-md text-sm font-medium text-muted-foreground border">
              +91
            </div>
            <Input
              type="tel"
              maxLength={10}
              placeholder="9876543210"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {error && <p className="text-sm text-destructive mb-3">{error}</p>}

          <button
            className="w-full kinetic-gradient text-white font-bold font-display rounded-xl py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
            disabled={loading || phone.length !== 10}
            onClick={handleContinue}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'register') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-card rounded-[2rem] shadow-elevated p-10 space-y-3">
          <button
            className="text-xs text-muted-foreground mb-1 flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => { setScreen('pin'); setError(null); }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="text-xl font-bold text-center">Join this fleet</h1>
          <p className="text-sm text-muted-foreground text-center">
            Your fleet manager approves you and gives you a PIN for +91 ••••••{phone.slice(-4)}.
          </p>
          <div>
            <Label htmlFor="driverName" className="font-label text-sm text-muted-foreground">Full Name</Label>
            <Input
              id="driverName"
              placeholder="e.g. Ramesh Kumar"
              value={driverName}
              onChange={e => setDriverName(e.target.value)}
              className="bg-muted border-none rounded-xl mt-1"
            />
          </div>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <button
            className="w-full kinetic-gradient text-white font-bold font-display rounded-xl py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
            disabled={loading || !driverName.trim()}
            onClick={handleRegister}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Register
          </button>
        </div>
      </div>
    );
  }

  // screen === 'pin'
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-card rounded-[2rem] shadow-elevated p-10">
        <button
          className="text-xs text-muted-foreground mb-4 flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={() => { setScreen('phone'); setPin(''); setError(null); }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">Enter your PIN</h1>
          <p className="text-sm text-muted-foreground mt-1">
            6-digit PIN from your fleet manager for +91 ••••••{phone.slice(-4)}
          </p>
        </div>

        <div className="flex justify-center mb-4">
          <InputOTP maxLength={6} value={pin} onChange={setPin}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && <p className="text-sm text-destructive mb-3 text-center">{error}</p>}

        <button
          className="w-full kinetic-gradient text-white font-bold font-display rounded-xl py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60 mb-4"
          onClick={handleVerify}
          disabled={loading || pin.length < 6}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>

        <button
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { setScreen('register'); setError(null); }}
        >
          New driver? Register to join this fleet
        </button>
      </div>
    </div>
  );
}
