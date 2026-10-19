import { useState, useEffect } from 'react';
import { Car, Clock, ChevronLeft, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { DriverApp } from '@/components/driver/DriverApp';
import { useOrg } from '@/hooks/useOrg';

type Screen = 'phone' | 'otp' | 'holding' | 'app';

export function DriverLoginPage() {
  const [screen, setScreen] = useState<Screen>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [driverName, setDriverName] = useState('');
  const [foundDriver, setFoundDriver] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { org } = useOrg();
useEffect(() => {
    const savedDriver = sessionStorage.getItem('fleetos_driver');
    const savedScreen = sessionStorage.getItem('fleetos_driver_screen');
    if (!savedDriver || !savedScreen) return;

    const parsed = JSON.parse(savedDriver);

    // Always fetch fresh status from Supabase — admin may have approved/rejected
    (supabase as any)
      .from('drivers')
      .select('*')
      .eq('id', parsed.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          // Driver deleted — clear session
          sessionStorage.removeItem('fleetos_driver');
          sessionStorage.removeItem('fleetos_driver_screen');
          return;
        }

        // Update sessionStorage with fresh data
        const freshScreen: Screen =
          data.status === 'free' || data.status === 'on-trip' ? 'app' : 'holding';

        sessionStorage.setItem('fleetos_driver', JSON.stringify(data));
        sessionStorage.setItem('fleetos_driver_screen', freshScreen);

        setFoundDriver(data);
        setScreen(freshScreen);
      });
  }, []);
  const handleSendOtp = async () => {
    setLoading(true);
    setError(null);
    const db = supabase as any;
    const { data } = await db
      .from('drivers')
      .select('*')
      .eq('org_id', org!.id)
      .ilike('phone', `%${phone.slice(-10)}`)
      .maybeSingle();
    setFoundDriver(data);
    setScreen('otp');
    setLoading(false);
  };

   const handleVerify = () => {
    setError(null);
    if (otp.length < 6) {
      setError('Enter 6-digit code');
      return;
    }
    if (foundDriver) {
      if (foundDriver.status === 'free' || foundDriver.status === 'on-trip') {
        sessionStorage.setItem('fleetos_driver', JSON.stringify(foundDriver));
        sessionStorage.setItem('fleetos_driver_screen', 'app');
        setScreen('app');
      } else if (foundDriver.status === 'pending_approval') {
        sessionStorage.setItem('fleetos_driver', JSON.stringify(foundDriver));
        sessionStorage.setItem('fleetos_driver_screen', 'holding');
        setScreen('holding');
      }
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    const db = supabase as any;
    await db.from('drivers').insert({
      org_id: org!.id,
      name: driverName,
      phone: '+91' + phone,
      status: 'pending_approval',
    });
    sessionStorage.setItem('fleetos_driver_screen', 'holding');
    setScreen('holding');
    setLoading(false);
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
            onClick={handleSendOtp}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send OTP
          </button>
        </div>
      </div>
    );
  }

  // screen === 'otp'
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-card rounded-[2rem] shadow-elevated p-10">
        <button
          className="text-xs text-muted-foreground mb-4 flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={() => { setScreen('phone'); setOtp(''); setError(null); }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">Enter OTP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Code sent to +91 ••••••{phone.slice(-4)}
          </p>
        </div>

        <div className="flex justify-center mb-4">
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
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
          disabled={otp.length < 6}
        >
          Verify
        </button>

        {/* Name registration — only when driver not found and OTP is complete */}
        {!foundDriver && otp.length === 6 && (
          <div className="border-t pt-4 mt-2 space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Phone not registered. Enter your name to register.
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
            <button
              className="w-full kinetic-gradient text-white font-bold font-display rounded-xl py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
              disabled={loading || !driverName.trim()}
              onClick={handleRegister}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Register
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
