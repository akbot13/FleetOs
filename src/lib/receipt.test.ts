import { describe, it, expect } from 'vitest';
import { receiptHtml } from './receipt';

const booking = {
  id: 77, customer_name: 'Riya', customer_phone: '+91 98290 12345', pickup: 'Jaipur Junction', drop: 'Hawa Mahal',
  trip_type: 'city', vehicle_class: '6_seater', scheduled_at: '2026-11-02T04:30:00Z',
  fare: 1850, amount_collected: 1850, payment_method: 'upi', payment_confirmed_at: '2026-11-02T06:00:00Z',
};
const fleet = { name: 'Anil Cabs', upi_id: 'anilcabs@upi' };

describe('receiptHtml', () => {
  it('shows the trip, fare and payment', () => {
    const html = receiptHtml(booking, fleet, new Date('2026-11-02T07:00:00Z'));
    expect(html).toContain('Trip receipt #77');
    expect(html).toContain('<th>Trip</th><td>City ride</td>');
    expect(html).toContain('<th>Car</th><td>6-seater</td>');
    expect(html).toContain('₹1,850');
    expect(html).toContain('Paid (UPI)');
    expect(html).toContain('Paid in full');
    expect(html).not.toContain('Balance due');
  });

  it('shows the balance and UPI ID when not fully paid', () => {
    const html = receiptHtml({ ...booking, amount_collected: 1000, payment_method: 'cash' }, fleet);
    expect(html).toContain('<tr class="due"><th>Balance due</th><td>₹850</td></tr>');
    expect(html).toContain('anilcabs@upi');
  });

  it('escapes text typed by customers', () => {
    const html = receiptHtml({ ...booking, customer_name: '<script>alert(1)</script>', pickup: 'A & B "C"' }, fleet);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B &quot;C&quot;');
  });
});
