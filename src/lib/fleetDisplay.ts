// Small display rules shared by the customer and driver screens.

/** Up to two capital letters for a logo-less fleet: "Anil Cabs" gives "AC". Empty for a blank name. */
export function monogram(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const letters = words.length === 1
    ? Array.from(words[0]).slice(0, 2)
    : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join('').toLocaleUpperCase('en-IN');
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Ramesh Kumar" gives "Ramesh". Empty for a blank name. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export type PaymentMethodId = 'cash' | 'upi';

/**
 * The payment methods a fleet accepts, in a fixed order. Unknown values are dropped. A fleet whose
 * list is empty (never saved) is treated as cash only, which every fleet can take.
 */
export function acceptedPayments(methods: readonly string[] | null | undefined): PaymentMethodId[] {
  const list = (['cash', 'upi'] as const).filter(m => (methods ?? []).includes(m));
  return list.length > 0 ? list : ['cash'];
}

/** The method to preselect: keep the current one when it is accepted, else the first accepted. */
export function pickPayment(accepted: readonly PaymentMethodId[], current?: string | null): PaymentMethodId {
  return accepted.find(m => m === current) ?? accepted[0];
}

export const PAYMENT_LABELS: Record<PaymentMethodId, string> = { cash: 'Cash', upi: 'UPI' };

/** A short, stable fingerprint of text, used to notice when the owner edits the driver note. */
export function textHash(...parts: (string | null | undefined)[]): string {
  const text = parts.map(p => (p ?? '').trim()).join('␟');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
