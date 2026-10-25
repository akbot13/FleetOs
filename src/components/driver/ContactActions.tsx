import { Phone, PhoneCall } from 'lucide-react';

// ─── CONTACT ACTIONS ────────────────────────────────────────────────────

export function ContactActions({
  customerName,
  customerPhone,
}: {
  customerName: string;
  customerPhone: string;
}) {
  const sanitizedPhone = customerPhone.replace(/\D/g, '');

  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={sanitizedPhone ? `tel:${sanitizedPhone}` : undefined}
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
          sanitizedPhone
            ? 'border-blue-500/30 bg-blue-500/15 text-blue-300 active:scale-95'
            : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500'
        }`}
        aria-disabled={!sanitizedPhone}
      >
        <PhoneCall className="h-4 w-4" />
        Call {customerName}
      </a>
      <a
        href={sanitizedPhone ? `https://wa.me/${sanitizedPhone}` : undefined}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
          sanitizedPhone
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 active:scale-95'
            : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500'
        }`}
        aria-disabled={!sanitizedPhone}
      >
        <Phone className="h-4 w-4" />
        WhatsApp
      </a>
    </div>
  );
}
