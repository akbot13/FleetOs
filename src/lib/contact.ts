// Phone links for the Call and WhatsApp actions. Owners type numbers any way they like
// ("98765 43210", "+91 98765 43210", "0141 234 5678"); these helpers turn them into dialable links.

const INDIA = '91';

/** Digits only, with a leading country code. A 10-digit number is taken to be Indian. Null when unusable. */
export function dialDigits(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!raw.startsWith('+') && digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10) return INDIA + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** tel: link, or null when the number is blank or too short. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = dialDigits(phone);
  return digits ? `tel:+${digits}` : null;
}

/** https://wa.me link, or null when the number is blank or too short. */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = dialDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}
