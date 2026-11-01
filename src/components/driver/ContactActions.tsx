import { Phone, PhoneCall } from 'lucide-react';
import { telHref, whatsappHref } from '@/lib/contact';

// ─── CONTACT ACTIONS ────────────────────────────────────────────────────

export function ContactActions({
  customerName,
  customerPhone,
}: {
  customerName: string;
  customerPhone: string;
}) {
  const call = telHref(customerPhone);
  const whatsapp = whatsappHref(customerPhone);

  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={call ?? undefined}
        className={`flex items-center justify-center gap-2 min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-all ${
          call
            ? 'border-blue-500/30 bg-blue-500/15 text-blue-300 active:scale-95'
            : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500'
        }`}
        aria-disabled={!call}
      >
        <PhoneCall className="h-4 w-4 shrink-0" />
        <span className="truncate">Call {customerName}</span>
      </a>
      <a
        href={whatsapp ?? undefined}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center justify-center gap-2 min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-all ${
          whatsapp
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 active:scale-95'
            : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500'
        }`}
        aria-disabled={!whatsapp}
      >
        <Phone className="h-4 w-4" />
        WhatsApp
      </a>
    </div>
  );
}
