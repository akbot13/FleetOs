import { supabase } from '@/integrations/supabase/client';

type DispatchChannel = 'sms' | 'whatsapp';

interface BookingLike {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  pickup: string | null;
  drop: string | null;
  fare: number | null;
  payment_method: string | null;
  scheduled_at: string | null;
}

interface DriverLike {
  name: string | null;
  phone: string | null;
  vehicle_model?: string | null;
  plate_number?: string | null;
}

interface OrgMessagingConfig {
  brand_name?: string | null;
  google_review_url?: string | null;
  upi_id?: string | null;
}

async function logCustomerMessage(customerPhone: string | null, intent: string, message: string) {
  if (!customerPhone || !message.trim()) return;

  const db = supabase;
  const { error } = await db.from('messages_log').insert({
    customer_phone: customerPhone,
    intent,
    message_out: message,
    confidence: 1,
    escalated: false,
  });

  if (error) {
    console.warn(`Failed to log customer message for ${intent}:`, error.message);
  }
}

async function dispatchCustomerMessage(
  booking: BookingLike,
  intent: string,
  message: string,
  channels: DispatchChannel[] = ['sms', 'whatsapp']
) {
  await logCustomerMessage(booking.customer_phone, intent, message);

  if (!booking.customer_phone || !message.trim()) return;

  // The function sends to the booking's own customer phone, looked up server-side.
  const { error } = await supabase.functions.invoke('customer-comms-dispatch', {
    body: {
      bookingId: booking.id,
      intent,
      message,
      channels,
    },
  });

  if (error) {
    console.warn(`Customer automation dispatch failed for ${intent}:`, error.message);
  }
}

function formatSchedule(iso: string | null) {
  if (!iso) return 'Soon';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export async function queueAssignmentMessage(
  booking: BookingLike,
  driver: DriverLike,
  org: OrgMessagingConfig | null | undefined
) {
  const fleetName = org?.brand_name || 'FleetOS';
  const driverLine = driver.phone
    ? `${driver.name ?? 'Your driver'} (${driver.phone})`
    : `${driver.name ?? 'Your driver'}`;
  const vehicleBits = [driver.vehicle_model, driver.plate_number].filter(Boolean).join(' · ');
  const vehicleLine = vehicleBits ? `Vehicle: ${vehicleBits}` : null;

  const lines = [
    `Your trip with ${fleetName} is confirmed.`,
    `Booking #${booking.id}`,
    `Pickup: ${booking.pickup ?? '-'}`,
    `Drop: ${booking.drop ?? '-'}`,
    `Time: ${formatSchedule(booking.scheduled_at)}`,
    `Driver: ${driverLine}`,
    vehicleLine,
  ].filter(Boolean);

  await dispatchCustomerMessage(booking, 'driver_assigned', lines.join('\n'));
}

export async function queueFeedbackMessage(
  booking: BookingLike,
  org: OrgMessagingConfig | null | undefined
) {
  const fleetName = org?.brand_name || 'FleetOS';
  const reviewLine = org?.google_review_url
    ? `Review us: ${org.google_review_url}`
    : 'Reply with your feedback and rating for this trip.';

  const lines = [
    `Thank you for riding with ${fleetName}.`,
    `Trip #${booking.id} is marked completed.`,
    reviewLine,
  ];

  await dispatchCustomerMessage(booking, 'trip_completed_feedback', lines.join('\n'));
}

export async function queueInvoiceMessage(
  booking: BookingLike,
  amount: number,
  method: 'cash' | 'upi' | 'card',
  org: OrgMessagingConfig | null | undefined
) {
  const fleetName = org?.brand_name || 'FleetOS';
  const lines = [
    `${fleetName} invoice`,
    `Booking #${booking.id}`,
    `Route: ${booking.pickup ?? '-'} -> ${booking.drop ?? '-'}`,
    `Amount paid: Rs ${amount.toLocaleString('en-IN')}`,
    `Payment mode: ${method.toUpperCase()}`,
    `Scheduled trip: ${formatSchedule(booking.scheduled_at)}`,
  ];

  if (method === 'upi' && org?.upi_id) {
    lines.push(`Paid to UPI ID: ${org.upi_id}`);
  }

  await dispatchCustomerMessage(booking, 'invoice_sent', lines.join('\n'));
}
