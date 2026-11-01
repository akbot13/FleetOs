import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { fareQuoteInput, type BookingRequestInput } from '@/lib/bookingRequest';

// Asks the server for an estimate. Only fields that change the fare are in the query key, so the
// form and the summary share one cached result and typing a name never refetches.
export function useFareQuote(data: BookingRequestInput) {
  const { org } = useOrg();
  const input = fareQuoteInput(data);
  const ready = !!org?.id && !!data.date && !!data.time;
  const query = useQuery({
    queryKey: ['fare-quote', org?.id, input],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const { data: quote, error } = await supabase.rpc('quote_fare', { p_org_id: org!.id, p_booking: input });
      if (error) throw error;
      return Number(quote);
    },
  });
  return {
    fare: query.data as number | undefined,
    isLoading: ready && query.isLoading,
    isError: query.isError,
  };
}
