import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from './useOrg';

// Driver-only content set by the owner in Settings. Only that fleet's admin and its approved,
// signed-in drivers can read it; for anyone else the query returns null.
export interface OrgDriverInfo {
  welcome_note: string | null;
  rules: string | null;
  office_phone: string | null;
}

export const orgDriverInfoKey = (orgId: string | undefined) => ['org_driver_info', orgId] as const;

export function useOrgDriverInfo() {
  const { org } = useOrg();
  return useQuery({
    queryKey: orgDriverInfoKey(org?.id),
    enabled: !!org,
    queryFn: async (): Promise<OrgDriverInfo | null> => {
      const { data, error } = await supabase
        .from('org_driver_info')
        .select('welcome_note, rules, office_phone')
        .eq('org_id', org!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export async function saveOrgDriverInfo(orgId: string, info: OrgDriverInfo) {
  const { error } = await supabase
    .from('org_driver_info')
    .upsert({ org_id: orgId, ...info, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
  if (error) throw error;
}
