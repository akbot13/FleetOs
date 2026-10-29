import { useState, useEffect } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { ScheduledTrip } from './types';
import { TRIP_TYPE_ICONS, formatTime, getHoursUntil } from './helpers';

// ─── ALARM COMPONENT ─────────────────────────────────────────────────────────

export function TripAlarm({ trip, onConfirm, onDismiss }: {
  trip: ScheduledTrip;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if ('vibrate' in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let stopped = false;
    const playBeep = () => {
      if (stopped) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = () => { if (!stopped) setTimeout(playBeep, 200); };
    };
    playBeep();
    return () => { stopped = true; ctx.close(); if ('vibrate' in navigator) navigator.vibrate(0); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); onDismiss(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-64 w-64 rounded-full bg-orange-500/20 animate-ping" />
        <div className="absolute h-48 w-48 rounded-full bg-orange-500/30 animate-ping" style={{ animationDelay: '0.2s' }} />
        <div className="relative z-10 bg-gray-900 border-2 border-orange-500 rounded-3xl p-6 mx-6 max-w-sm w-full shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-orange-400 text-xs font-bold uppercase tracking-widest">New Trip Assigned</span>
            </div>
            <span className="text-gray-400 text-xs font-mono">{countdown}s</span>
          </div>
          <div className="h-1 w-full bg-gray-700 rounded-full mb-5">
            <div className="h-1 bg-orange-500 rounded-full transition-all duration-1000" style={{ width: `${(countdown / 30) * 100}%` }} />
          </div>
          <div className="mb-5">
            <div className="text-2xl font-black text-white mb-1">{trip.customerName}</div>
            <div className="text-orange-400 font-bold text-lg mb-3">{TRIP_TYPE_ICONS[trip.tripType]} ₹{trip.fare.toLocaleString()}</div>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Pickup</div><div className="text-sm font-semibold text-white">{trip.pickup}</div></div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <div><div className="text-xs text-gray-400">Drop</div><div className="text-sm font-semibold text-white">{trip.drop}</div></div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700">
              <div className="text-center flex-1"><div className="text-white font-bold">{formatTime(trip.scheduledAt)}</div><div className="text-gray-400 text-[10px] uppercase tracking-wider">Pickup Time</div></div>
              <div className="text-center flex-1"><div className="text-white font-bold">{trip.distance}</div><div className="text-gray-400 text-[10px] uppercase tracking-wider">Distance</div></div>
              <div className="text-center flex-1"><div className="text-orange-400 font-bold">{getHoursUntil(trip.scheduledAt)}</div><div className="text-gray-400 text-[10px] uppercase tracking-wider">ETA</div></div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 py-4 rounded-2xl kinetic-gradient active:scale-95 transition-all font-display font-black text-white text-xl flex items-center justify-center gap-2 shadow-elevated min-h-[64px]">
              <CheckCircle className="h-5 w-5" /> CONFIRM
            </button>
            <button onClick={onDismiss} className="flex-1 py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 active:scale-95 transition-all font-bold text-gray-300 text-base flex items-center justify-center gap-2">
              <XCircle className="h-5 w-5" /> Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
