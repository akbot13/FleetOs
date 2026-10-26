import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

type DispatchChannel = "sms" | "whatsapp";

interface DispatchPayload {
  bookingId?: number | null;
  intent?: string | null;
  message?: string | null;
  channels?: DispatchChannel[];
}

interface OutboundMessage {
  customerPhone: string;
  intent: string;
  message: string;
}

const MAX_MESSAGE_LENGTH = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function postToChannel(channel: DispatchChannel, payload: OutboundMessage) {
  const endpoint = Deno.env.get(channel === "sms" ? "SMS_WEBHOOK_URL" : "WHATSAPP_WEBHOOK_URL");
  const token = Deno.env.get(channel === "sms" ? "SMS_WEBHOOK_TOKEN" : "WHATSAPP_WEBHOOK_TOKEN");

  if (!endpoint) {
    return {
      channel,
      status: "skipped",
      reason: "missing_endpoint",
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      source: "FleetOs",
      channel,
      customerPhone: payload.customerPhone,
      intent: payload.intent,
      message: payload.message,
      sentAt: new Date().toISOString(),
    }),
  });

  return {
    channel,
    status: response.ok ? "sent" : "failed",
    statusCode: response.status,
  };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let payload: DispatchPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  if (!payload.bookingId || !payload.message || !payload.intent) {
    return jsonResponse(400, { error: "bookingId, intent, and message are required" });
  }
  if (payload.message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(400, { error: "message is too long" });
  }

  // Act as the caller, so the database rules decide what they can see: an org's admin reads its
  // bookings, a signed-in driver only their own trips, everyone else nothing. The phone number
  // comes from the booking, never from the request.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return jsonResponse(401, { error: "Sign in to send messages" });
  }
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, customer_phone")
    .eq("id", payload.bookingId)
    .maybeSingle();
  if (bookingError || !booking) {
    return jsonResponse(403, { error: "Booking not found for this account" });
  }
  if (!booking.customer_phone) {
    return jsonResponse(400, { error: "This booking has no customer phone" });
  }

  const outbound: OutboundMessage = { customerPhone: booking.customer_phone, intent: payload.intent, message: payload.message };
  const allowed: DispatchChannel[] = ["sms", "whatsapp"];
  const channels = (payload.channels?.length ? payload.channels : allowed).filter((c) => allowed.includes(c));
  const results = await Promise.all(channels.map((channel) => postToChannel(channel, outbound)));

  const hasSuccessfulDispatch = results.some((result) => result.status === "sent");

  return jsonResponse(200, {
    ok: hasSuccessfulDispatch,
    deliveries: results,
  });
});
