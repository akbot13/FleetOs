import { MessageCircle } from 'lucide-react';
import { useOrg } from '@/hooks/useOrg';
import {
  customerConfirmationMessage, customerDriverMessage, driverTripMessage, whatsappLink,
  type MessageBooking, type MessageDriver,
} from '@/lib/whatsappMessages';

// One-tap WhatsApp messages for a booking. Each opens WhatsApp with the message typed out;
// the admin checks it and presses send. A button is left out when its phone number is missing.
export function BookingWhatsApp({ booking, driver }: { booking: MessageBooking; driver: MessageDriver | null }) {
  const { org } = useOrg();
  const brand = org?.brand_name || org?.name || 'Your cab';
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const actions = [
    driver
      ? { label: 'Send driver details to customer', href: whatsappLink(booking.customer_phone, customerDriverMessage(booking, driver, brand, origin)) }
      : { label: 'Send booking confirmation to customer', href: whatsappLink(booking.customer_phone, customerConfirmationMessage(booking, brand, origin)) },
    driver && { label: 'Send trip to driver', href: whatsappLink(driver.phone, driverTripMessage(booking, brand)) },
  ].filter((a): a is { label: string; href: string } => !!a && !!a.href);

  if (actions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/80 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">WhatsApp</p>
      <div className="flex flex-wrap gap-2">
        {actions.map(a => (
          <a
            key={a.label}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20 dark:text-[#5BE38C]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {a.label}
          </a>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Opens WhatsApp with the message ready. Check it, then press send.</p>
    </div>
  );
}
