import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrgConfig {
  id: string;
  slug: string;
  name: string;
  brand_name: string;
  brand_logo_url: string | null;
  brand_color: string | null;
  join_code: string;
  upi_id: string | null;
  upi_qr_url: string | null;
  google_review_url: string | null;
  report_frequency_days: number;
}

interface OrgContextType {
  org: OrgConfig | null;
  orgLoading: boolean;
  orgError: string | null;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  orgLoading: true,
  orgError: null,
});

function resolveSlugFromHostname(): { slug: string | null; customDomain: string | null } {
  const hostname = window.location.hostname;

  // Local dev — default to 'anilcabs' so existing dev flow works unchanged
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { slug: 'anilcabs', customDomain: null };
  }

  // Subdomain of fleetos.app  e.g. anilcabs.fleetos.app
  if (hostname.endsWith('.fleetos.app')) {
    const slug = hostname.replace('.fleetos.app', '');
    if (slug && slug !== 'fleetos' && slug !== 'www') {
      return { slug, customDomain: null };
    }
    return { slug: null, customDomain: null };
  }

  // Custom domain e.g. book.anilcabs.com
  return { slug: null, customDomain: hostname };
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrgConfig | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { slug, customDomain } = resolveSlugFromHostname();

      if (!slug && !customDomain) {
        setOrgError('No organisation found for this URL');
        setOrgLoading(false);
        return;
      }

      const db = supabase as any;
        let query = db
          .from('organizations')
          // Only public columns: secrets like whatsapp_api_key are not readable from the browser.
          .select('id, slug, name, brand_name, brand_logo_url, brand_color, join_code, upi_id, upi_qr_url, google_review_url, report_frequency_days');

      if (slug) {
        query = query.eq('slug', slug);
      } else {
        query = query.eq('custom_domain', customDomain);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        setOrgError(error.message);
      } else if (!data) {
        setOrgError('Organisation not found');
      } else {
        setOrg(data as OrgConfig);
        if (data.brand_color) {
          document.documentElement.style.setProperty('--brand-color', data.brand_color);
        }
      }
      setOrgLoading(false);
    };

    load();
  }, []);

  return (
    <OrgContext.Provider value={{ org, orgLoading, orgError }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
