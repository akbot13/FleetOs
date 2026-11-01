import { describe, it, expect } from 'vitest';
import { formFromOrg, imageProblem, isDirty, toDriverInfo, toOrgUpdate, validateSettings } from './ownerSettings';
import type { OrgConfig } from '@/hooks/useOrg';

const org: OrgConfig = {
  id: 'o1', slug: 'patil', name: 'Patil', brand_name: 'Patil Cabs', brand_logo_url: null, cover_image_url: null, brand_color: null,
  join_code: 'ABC123', upi_id: null, upi_qr_url: null, google_review_url: null, report_frequency_days: 7,
  tagline: null, welcome_message: null, service_area: null, service_hours: null, support_phone: null,
  whatsapp_phone: null, cancellation_note: null, thank_you_message: null, highlights: [],
  payment_methods: ['cash', 'upi'], custom_domain: null,
};
const base = () => formFromOrg(org, null);

describe('validateSettings', () => {
  it('accepts an untouched form', () => {
    expect(validateSettings(base())).toEqual({});
  });

  it('requires a name and one payment method', () => {
    const e = validateSettings({ ...base(), brand_name: '  ', payment_methods: [] });
    expect(e.brand_name).toBeTruthy();
    expect(e.payment_methods).toBeTruthy();
  });

  it('checks phones, review link, UPI id and lengths', () => {
    const e = validateSettings({
      ...base(), support_phone: '12345', whatsapp_phone: '+91 98765 43210',
      google_review_url: 'http://g.page/x', upi_id: 'nope', tagline: 'x'.repeat(81),
    });
    expect(e.support_phone).toBeTruthy();
    expect(e.whatsapp_phone).toBeUndefined();
    expect(e.google_review_url).toBeTruthy();
    expect(e.upi_id).toBeTruthy();
    expect(e.tagline).toBeTruthy();
  });

  it('allows https links and valid UPI ids', () => {
    const e = validateSettings({ ...base(), google_review_url: 'https://g.page/r/abc', upi_id: 'patil.cabs@okhdfc' });
    expect(e).toEqual({});
  });

  it('limits highlights to four', () => {
    const ids = ['verified_drivers', 'clean_cars', 'on_time', 'no_hidden_charges', 'women_friendly'];
    expect(validateSettings({ ...base(), highlights: ids }).highlights).toBeTruthy();
  });
});

describe('saving', () => {
  it('stores blanks as null and trims', () => {
    const u = toOrgUpdate({ ...base(), tagline: '  Safe rides  ', service_area: '   ' });
    expect(u.tagline).toBe('Safe rides');
    expect(u.service_area).toBeNull();
    expect(u.brand_color).toBeNull();
    expect(u.cover_image_url).toBeNull();
    expect(toOrgUpdate({ ...base(), cover_image_url: 'https://x/c.jpg' }).cover_image_url).toBe('https://x/c.jpg');
    expect(toDriverInfo(base())).toEqual({ welcome_note: null, rules: null, office_phone: null });
  });

  it('detects changes', () => {
    expect(isDirty(base(), base())).toBe(false);
    expect(isDirty(base(), { ...base(), tagline: 'x' })).toBe(true);
  });
});

describe('imageProblem', () => {
  it('rejects wrong types and big files', () => {
    expect(imageProblem({ type: 'image/svg+xml', size: 100 })).toMatch(/PNG/);
    expect(imageProblem({ type: 'image/png', size: 3 * 1024 * 1024 })).toMatch(/2 MB/);
    expect(imageProblem({ type: 'image/webp', size: 1000 })).toBeNull();
  });
});
