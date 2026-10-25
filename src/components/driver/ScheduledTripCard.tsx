import { CheckCircle, WifiOff, AlarmClock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ScheduledTrip } from './types';
import { TRIP_TYPE_ICONS, formatTime, formatDate, getHoursUntil } from './helpers';

// ─── SCHEDULED TRIP CARD ──────────────────────────────────────────────────────

export function ScheduledTripCard({ trip, isOffline, onConfirm, onTap }: {
  trip: ScheduledTrip;
  isOffline: boolean;
  onConfirm: (id: string) => void;
  onTap: (trip: ScheduledTrip) => void;
}) {
  const hoursAway = (new Date(trip.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const isUrgent = hoursAway < 2;

  return (
    <Card
      className={`p-4 border cursor-pointer ${isUrgent ? 'border-orange-500/50 bg-orange-500/5' : 'border-gray-700 bg-gray-900'}`}
      onClick={() => onTap(trip)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">{TRIP_TYPE_ICONS[trip.tripType]} {trip.tripType}</div>
          <div className="font-bold text-white">{trip.customerName}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black text-white">₹{trip.fare.toLocaleString()}</div>
          <div className="text-xs text-gray-400">{trip.distance}</div>
        </div>
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" /><span className="text-gray-300 truncate">{trip.pickup}</span></div>
        <div className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" /><span className="text-gray-300 truncate">{trip.drop}</span></div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs">
          <AlarmClock className={`h-3.5 w-3.5 ${isUrgent ? 'text-orange-400' : 'text-gray-400'}`} />
          <span className={isUrgent ? 'text-orange-300 font-bold' : 'text-gray-400'}>{formatDate(trip.scheduledAt)} · {formatTime(trip.scheduledAt)}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isUrgent ? 'bg-orange-500/20 text-orange-300' : 'bg-gray-700 text-gray-300'}`}>{getHoursUntil(trip.scheduledAt)}</span>
      </div>
      {trip.status === 'pending_confirm' ? (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm(trip.id); }}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 active:scale-95 transition-all text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <CheckCircle className="h-4 w-4" /> Confirm Trip
          </button>
          {isOffline && <div className="flex items-center gap-1 text-[10px] text-orange-400 px-2"><WifiOff className="h-3 w-3" /><span>Offline·saves locally</span></div>}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm font-bold text-green-300">Confirmed</span>
          {isOffline && <WifiOff className="h-3 w-3 text-orange-400 ml-auto" />}
        </div>
      )}
    </Card>
  );
}
