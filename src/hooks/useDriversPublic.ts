import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';

export interface PublicDriver {
  id: number;
  name: string | null;
  vehicle_model: string | null;
  status: string | null;
}

export function useDriversPublic() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ['drivers_public', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers_public')
        .select('id, name, vehicle_model, status')
        .eq('org_id', org!.id);
      if (error) throw error;
      return (data ?? []) as unknown as PublicDriver[];
    },
  });
}
