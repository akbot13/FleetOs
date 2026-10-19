import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { hasApprovedDriverSession } from '@/lib/viewAccess';

export function useUserRole() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user) return { isAdmin: false, isDriver: false };
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) return { isAdmin: false, isDriver: false };
      const roles = (data ?? []).map(r => r.role);
      return {
        isAdmin:  roles.includes('admin'),
        isDriver: (roles as string[]).includes('driver'),
      };
    },
    enabled: !!user,
  });

  return {
    isAdmin:  data?.isAdmin  ?? false,
    isDriver: data?.isDriver ?? false,
    hasApprovedDriverSession: hasApprovedDriverSession(),
    isLoading,
  };
}
