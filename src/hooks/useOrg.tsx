import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hexToHsl } from '@/lib/brandColor';

export interface OrgConfig {
  id: string;
  slug: string;
  name: string;
  brand_name: string;
  brand_logo_url: string | null;
  cover_image_url: string | null;
  brand_color: string | null;
  join_code: string;
  upi_id: string | null;
  upi_qr_url: string | null;
  google_review_url: string | null;
  report_frequency_days: number;
  // Owner-set content. Blank (null or empty) means the owner left it out: show nothing.
  tagline: string | null;
  welcome_message: string | null;
  service_area: string | null;
  service_hours: string | null;
  support_phone: string | null;
  whatsapp_phone: string | null;
  cancellation_note: string | null;
  thank_you_message: string | null;
  highlights: string[];
  payment_methods: string[];
  custom_domain: string | null;
}

interface OrgContextType {
  org: OrgConfig | null;
  orgLoading: boolean;
  orgError: string | null;
  /** Reload the organisation from the database, for example after saving settings. */
  refreshOrg: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  orgLoading: true,
  orgError: null,
  refreshOrg: async () => {},
});

// The fleet served when the address matches no organisation: local dev, Vercel preview links
// and the project's own *.vercel.app address. Safe because Vercel only serves addresses added
// to this project. Override with VITE_DEFAULT_ORG_SLUG once a second fleet goes live.
const DEFAULT_ORG_SLUG = import.meta.env.VITE_DEFAULT_ORG_SLUG || 'anilcabs';

const ORG_COLUMNS = 'id, slug, name, brand_name, brand_logo_url, cover_image_url, brand_color, join_code, upi_id, upi_qr_url, google_review_url, report_frequency_days, custom_domain, tagline, welcome_message, service_area, service_hours, support_phone, whatsapp_phone, cancellation_note, thank_you_message, highlights, payment_methods';

function resolveSlugFromHostname(): { slug: string | null; customDomain: string | null } {
  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { slug: DEFAULT_ORG_SLUG, customDomain: null };
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

  const load = useCallback(async () => {
    const { slug, customDomain } = resolveSlugFromHostname();

    if (!slug && !customDomain) {
      setOrgError('No organisation found for this URL');
      setOrgLoading(false);
      return;
    }

    // Only public columns: secrets like whatsapp_api_key are not readable from the browser.
    const orgs = supabase.from('organizations').select(ORG_COLUMNS);
    let { data, error } = await (slug
      ? orgs.eq('slug', slug)
      : orgs.eq('custom_domain', customDomain)
    ).maybeSingle();

    if (!error && !data && customDomain) {
      ({ data, error } = await supabase.from('organizations').select(ORG_COLUMNS)
        .eq('slug', DEFAULT_ORG_SLUG).maybeSingle());
    }

    if (error) {
      setOrgError(error.message);
    } else if (!data) {
      setOrgError('Organisation not found');
    } else {
      setOrg(data as OrgConfig);
      setOrgError(null);
    }
    setOrgLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Branding applies to every screen from here. A fleet with no colour keeps the stylesheet defaults.
  useEffect(() => {
    if (!org) return;
    const root = document.documentElement;
    const hsl = hexToHsl(org.brand_color);
    if (hsl) {
      root.style.setProperty('--primary', hsl);
      root.style.setProperty('--ring', hsl);
      root.style.setProperty('--secondary', hsl);
      root.style.setProperty('--brand-color', org.brand_color as string);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--secondary');
      root.style.removeProperty('--brand-color');
    }
    if (org.brand_name) document.title = org.brand_name;
  }, [org]);

  return (
    <OrgContext.Provider value={{ org, orgLoading, orgError, refreshOrg: load }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
