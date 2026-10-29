// A printable receipt for a trip, as a self-contained HTML page. The admin opens it and prints
// it or saves it as PDF from the browser.

export interface ReceiptBooking {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  pickup: string | null;
  drop: string | null;
  trip_type: string | null;
  vehicle_class?: string | null;
  scheduled_at: string | null;
  fare: number | null;
  amount_collected: number | null;
  payment_method: string | null;
  payment_confirmed_at: string | null;
}

export interface ReceiptFleet {
  name: string;
  upi_id?: string | null;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const ist = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  : '';

const tripLabels: Record<string, string> = { city: 'City ride', airport: 'Airport transfer', sightseeing: 'Sightseeing', outstation: 'Outstation' };

export function receiptHtml(b: ReceiptBooking, fleet: ReceiptFleet, issuedAt = new Date()) {
  const fare = b.fare ?? 0;
  const paid = b.payment_confirmed_at ? (b.amount_collected ?? 0) : 0;
  const due = Math.max(0, fare - paid);
  const rows: [string, string][] = [
    ['Customer', [b.customer_name, b.customer_phone].filter(Boolean).join(' · ')],
    ['Trip', tripLabels[b.trip_type ?? ''] ?? b.trip_type ?? ''],
    ['Car', b.vehicle_class === '6_seater' ? '6-seater' : b.vehicle_class === '4_seater' ? '4-seater' : ''],
    ['Pickup', b.pickup ?? ''],
    ['Drop', b.drop ?? ''],
    ['Date', ist(b.scheduled_at)],
  ];
  const detail = rows.filter(([, v]) => v).map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>`).join('');
  const payment = paid > 0
    ? `<tr><th>Paid${b.payment_method ? ` (${escapeHtml(b.payment_method.toUpperCase())})` : ''}</th><td>${rupees(paid)}</td></tr>
       <tr><th>Paid on</th><td>${escapeHtml(ist(b.payment_confirmed_at))}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${b.id} · ${escapeHtml(fleet.name)}</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d2330; background: #fff; margin: 0; padding: 24px 16px; }
  main { max-width: 480px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0; } .muted { color: #5b6372; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; font-weight: 500; color: #5b6372; padding: 6px 12px 6px 0; vertical-align: top; width: 38%; }
  td { padding: 6px 0; text-align: right; }
  .total th, .total td { border-top: 2px solid #1d2330; font-weight: 700; color: #1d2330; font-size: 16px; padding-top: 10px; }
  .due td { color: #b4232c; font-weight: 700; } .paid { color: #1f7a4a; font-weight: 700; }
  button { margin-top: 24px; width: 100%; padding: 12px; font: inherit; font-weight: 600; border: 0; border-radius: 10px; background: #1d2330; color: #fff; cursor: pointer; }
  @media print { button { display: none; } body { padding: 0; } }
</style></head>
<body><main>
  <h1>${escapeHtml(fleet.name)}</h1>
  <p class="muted">Trip receipt #${b.id} · issued ${escapeHtml(ist(issuedAt.toISOString()))}</p>
  <table>${detail}</table>
  <table>
    <tr class="total"><th>Fare</th><td>${rupees(fare)}</td></tr>
    ${payment}
    ${due > 0 ? `<tr class="due"><th>Balance due</th><td>${rupees(due)}</td></tr>` : `<tr><th></th><td class="paid">Paid in full</td></tr>`}
    ${due > 0 && fleet.upi_id ? `<tr><th>Pay by UPI</th><td>${escapeHtml(fleet.upi_id)}</td></tr>` : ''}
  </table>
  <p class="muted" style="margin-top:24px">Thank you for riding with ${escapeHtml(fleet.name)}.</p>
  <button onclick="window.print()">Print or save as PDF</button>
</main></body></html>`;
}

// Opens the receipt in a new tab. Returns false if the browser blocked the new tab.
export function openReceipt(b: ReceiptBooking, fleet: ReceiptFleet) {
  const tab = window.open('', '_blank');
  if (!tab) return false;
  tab.document.open();
  tab.document.write(receiptHtml(b, fleet));
  tab.document.close();
  return true;
}
