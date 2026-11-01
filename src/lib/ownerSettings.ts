import { isHexColor } from './brandColor';
import { FLEET_HIGHLIGHTS, MAX_HIGHLIGHTS } from './fleetHighlights';
import type { OrgConfig } from '@/hooks/useOrg';
import type { OrgDriverInfo } from '@/hooks/useOrgDriverInfo';

// The owner's Settings form: plain strings in, validated, then trimmed with blanks stored as null.
// Limits match the CHECK constraints in 20261030000000_owner_settings.sql.

export const LIMITS = {
  brand_name: 60,
  tagline: 80,
  welcome_message: 240,
  service_area: 120,
  service_hours: 80,
  cancellation_note: 240,
  thank_you_message: 200,
  driver_welcome_note: 300,
  driver_rules: 1000,
} as const;

export const PHONE_PATTERN = /^\+?[0-9 ]{10,15}$/;
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export interface SettingsForm {
  brand_name: string;
  brand_logo_url: string;
  cover_image_url: string;
  brand_color: string;
  tagline: string;
  welcome_message: string;
  service_area: string;
  service_hours: string;
  highlights: string[];
  cancellation_note: string;
  thank_you_message: string;
  support_phone: string;
  whatsapp_phone: string;
  payment_methods: string[];
  upi_id: string;
  upi_qr_url: string;
  google_review_url: string;
  driver_welcome_note: string;
  driver_rules: string;
  driver_office_phone: string;
}

export type SettingsErrors = Partial<Record<keyof SettingsForm, string>>;

export function formFromOrg(org: OrgConfig, driverInfo: OrgDriverInfo | null): SettingsForm {
  return {
    brand_name: org.brand_name ?? '',
    brand_logo_url: org.brand_logo_url ?? '',
    cover_image_url: org.cover_image_url ?? '',
    brand_color: isHexColor(org.brand_color) ? org.brand_color.toUpperCase() : '',
    tagline: org.tagline ?? '',
    welcome_message: org.welcome_message ?? '',
    service_area: org.service_area ?? '',
    service_hours: org.service_hours ?? '',
    highlights: [...(org.highlights ?? [])],
    cancellation_note: org.cancellation_note ?? '',
    thank_you_message: org.thank_you_message ?? '',
    support_phone: org.support_phone ?? '',
    whatsapp_phone: org.whatsapp_phone ?? '',
    payment_methods: [...(org.payment_methods ?? [])],
    upi_id: org.upi_id ?? '',
    upi_qr_url: org.upi_qr_url ?? '',
    google_review_url: org.google_review_url ?? '',
    driver_welcome_note: driverInfo?.welcome_note ?? '',
    driver_rules: driverInfo?.rules ?? '',
    driver_office_phone: driverInfo?.office_phone ?? '',
  };
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateSettings(f: SettingsForm): SettingsErrors {
  const e: SettingsErrors = {};
  const len = (key: keyof typeof LIMITS, label: string) => {
    if (f[key].trim().length > LIMITS[key]) e[key] = `${label} can be up to ${LIMITS[key]} characters`;
  };
  if (!f.brand_name.trim()) e.brand_name = 'Enter your fleet name';
  len('brand_name', 'Name');
  len('tagline', 'Tagline');
  len('welcome_message', 'Welcome message');
  len('service_area', 'Service area');
  len('service_hours', 'Service hours');
  len('cancellation_note', 'Cancellation note');
  len('thank_you_message', 'Thank-you message');
  len('driver_welcome_note', 'Welcome note');
  len('driver_rules', 'Rules');

  const phone = (key: 'support_phone' | 'whatsapp_phone' | 'driver_office_phone') => {
    const v = f[key].trim();
    if (v && !PHONE_PATTERN.test(v)) e[key] = 'Use 10 to 15 digits, with an optional + at the start';
  };
  phone('support_phone');
  phone('whatsapp_phone');
  phone('driver_office_phone');

  if (f.brand_color && !isHexColor(f.brand_color)) e.brand_color = 'Pick a colour from the list';
  if (f.highlights.length > MAX_HIGHLIGHTS) e.highlights = `Pick up to ${MAX_HIGHLIGHTS}`;
  if (f.payment_methods.length === 0) e.payment_methods = 'Accept at least one payment method';
  const upi = f.upi_id.trim();
  if (upi && !UPI_PATTERN.test(upi)) e.upi_id = 'Check the UPI ID, for example name@bank';
  const review = f.google_review_url.trim();
  if (review && !isHttpsUrl(review)) e.google_review_url = 'Link must start with https://';
  return e;
}

export function isDirty(a: SettingsForm, b: SettingsForm): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

const blank = (v: string) => v.trim() || null;

/** Columns to write to organizations. */
export function toOrgUpdate(f: SettingsForm) {
  return {
    brand_name: f.brand_name.trim(),
    brand_logo_url: blank(f.brand_logo_url),
    cover_image_url: blank(f.cover_image_url),
    brand_color: f.brand_color || null,
    tagline: blank(f.tagline),
    welcome_message: blank(f.welcome_message),
    service_area: blank(f.service_area),
    service_hours: blank(f.service_hours),
    highlights: FLEET_HIGHLIGHTS.map(h => h.id as string).filter(id => f.highlights.includes(id)),
    cancellation_note: blank(f.cancellation_note),
    thank_you_message: blank(f.thank_you_message),
    support_phone: blank(f.support_phone),
    whatsapp_phone: blank(f.whatsapp_phone),
    payment_methods: ['cash', 'upi'].filter(m => f.payment_methods.includes(m)),
    upi_id: blank(f.upi_id),
    upi_qr_url: blank(f.upi_qr_url),
    google_review_url: blank(f.google_review_url),
  };
}

/** Values to write to org_driver_info. */
export function toDriverInfo(f: SettingsForm): OrgDriverInfo {
  return {
    welcome_note: blank(f.driver_welcome_note),
    rules: blank(f.driver_rules),
    office_phone: blank(f.driver_office_phone),
  };
}

export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Message for a file that cannot be uploaded, or null when it is fine. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES[file.type]) return 'Use a PNG, JPG or WebP image';
  if (file.size > MAX_IMAGE_BYTES) return 'Image is over 2 MB. Pick a smaller one';
  return null;
}
