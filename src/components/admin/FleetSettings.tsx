import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Copy, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { useUserRole } from '@/hooks/useUserRole';
import { orgDriverInfoKey, saveOrgDriverInfo, useOrgDriverInfo } from '@/hooks/useOrgDriverInfo';
import { BRAND_SWATCHES } from '@/lib/brandColor';
import { FLEET_HIGHLIGHTS, MAX_HIGHLIGHTS } from '@/lib/fleetHighlights';
import {
  IMAGE_TYPES, LIMITS, formFromOrg, imageProblem, isDirty, toDriverInfo, toOrgUpdate, validateSettings,
  type SettingsForm,
} from '@/lib/ownerSettings';
import { cn } from '@/lib/utils';

const BUCKET = 'org-branding';
// The stylesheet default primary, used when the owner picks "Default" in the preview.
const DEFAULT_PRIMARY = 'hsl(37 100% 26%)';

const textareaClass =
  'flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max?: number;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  disabled?: boolean;
  inputMode?: 'text' | 'tel' | 'url';
}

function Field({ id, label, value, onChange, error, hint, max, placeholder, multiline, required, disabled, inputMode }: FieldProps) {
  const len = value.trim().length;
  const showCount = max !== undefined && len >= max * 0.8;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  const shared = {
    id,
    value,
    placeholder,
    disabled,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
        {showCount && (
          <span className={cn('text-xs tabular-nums', len > max! ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
            {len}/{max}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea {...shared} className={cn(textareaClass, error && 'border-destructive')} onChange={e => onChange(e.target.value)} />
      ) : (
        <Input {...shared} inputMode={inputMode} className={cn(error && 'border-destructive')} onChange={e => onChange(e.target.value)} />
      )}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Chip({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/10 text-foreground' : 'border-input bg-background text-muted-foreground hover:bg-muted',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-background',
      )}
    >
      {children}
    </button>
  );
}

function ImageUpload({ label, hint, value, onChange, orgId, prefix }: {
  label: string; hint: string; value: string; onChange: (url: string) => void; orgId: string; prefix: 'logo' | 'upi-qr' | 'cover';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const bad = imageProblem(file);
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem(null);
    setBusy(true);
    const path = `${orgId}/${prefix}-${Date.now()}.${IMAGE_TYPES[file.type]}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    setBusy(false);
    if (error) {
      setProblem('Upload failed. Check your connection and try again');
      return;
    }
    onChange(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-input bg-muted',
          prefix === 'cover' ? 'h-16 w-24' : 'h-16 w-16',
        )}>
          {value ? <img src={value} alt="" className={cn('h-full w-full', prefix === 'cover' ? 'object-cover' : 'object-contain')} /> : <Upload className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value && !busy && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
              <X className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {problem ? <p className="text-xs text-destructive" role="alert">{problem}</p> : <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the text and copy it');
    }
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input readOnly value={value} onFocus={e => e.currentTarget.select()} className="font-mono text-sm" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function HeaderPreview({ form }: { form: SettingsForm }) {
  const color = form.brand_color || DEFAULT_PRIMARY;
  const name = form.brand_name.trim() || 'Your fleet';
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Preview</p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {form.cover_image_url && (
          <img src={form.cover_image_url} alt="" className="aspect-[16/7] w-full object-cover" />
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          {form.brand_logo_url ? (
            <img src={form.brand_logo_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white" style={{ backgroundColor: color }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{name}</p>
            {form.tagline.trim() && <p className="truncate text-xs text-muted-foreground">{form.tagline.trim()}</p>}
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="flex h-10 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: color }}>
            Book a ride
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Updates as you type. Nothing is saved until you save.</p>
    </div>
  );
}

interface FleetSettingsProps {
  onOpenPricing?: () => void;
}

export function FleetSettings({ onOpenPricing }: FleetSettingsProps) {
  const { org, orgLoading, refreshOrg } = useOrg();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const driverInfo = useOrgDriverInfo();

  const driverInfoReady = !driverInfo.isLoading;
  const baseline = useMemo(
    () => (org && driverInfoReady ? formFromOrg(org, driverInfo.data ?? null) : null),
    [org, driverInfoReady, driverInfo.data],
  );
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Take the saved values on first load and after each save, but never overwrite unsaved edits.
  const dirty = !!form && !!baseline && isDirty(form, baseline);
  useEffect(() => {
    if (baseline && (form === null || !dirty)) setForm(baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline]);

  const errors = useMemo(() => (form ? validateSettings(form) : {}), [form]);
  const errorCount = Object.keys(errors).length;

  if (roleLoading || orgLoading || !form || !baseline || !org) {
    if (!roleLoading && !orgLoading && !isAdmin) return <AdminOnly />;
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading settings" />
      </div>
    );
  }
  if (!isAdmin) return <AdminOnly />;

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setSaveError(null);
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  };
  const toggle = (key: 'highlights' | 'payment_methods', id: string) => {
    const current = form[key];
    set(key, current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };
  const driverBlocked = !!driverInfo.error;

  const save = async () => {
    if (errorCount > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .update(toOrgUpdate(form))
        .eq('id', org.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Only the fleet admin can change these settings');

      const driverChanged = ['driver_welcome_note', 'driver_rules', 'driver_office_phone']
        .some(k => form[k as keyof SettingsForm] !== baseline[k as keyof SettingsForm]);
      if (driverChanged && !driverBlocked) {
        await saveOrgDriverInfo(org.id, toDriverInfo(form));
        await queryClient.invalidateQueries({ queryKey: orgDriverInfoKey(org.id) });
      }
      await refreshOrg();
      toast('Changes saved');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save. Try again');
    } finally {
      setSaving(false);
    }
  };

  const bookingLink = org.custom_domain ? `https://${org.custom_domain}` : window.location.origin;
  const upiOn = form.payment_methods.includes('upi');

  return (
    <div className="px-4 pb-40 pt-6 md:px-8 md:pt-8">
      <div className="mb-8 max-w-5xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">Settings</h2>
        <p className="mt-2 text-sm text-muted-foreground">Set what your customers and drivers see. Anything you leave blank is not shown.</p>
      </div>

      <div className="grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="order-2 space-y-12 lg:order-1">
          <Section title="Your brand">
            <Field id="brand_name" label="Display name" required max={LIMITS.brand_name} value={form.brand_name}
              onChange={v => set('brand_name', v)} error={errors.brand_name} />
            <ImageUpload label="Logo" hint="PNG, JPG or WebP, up to 2 MB. A square image works best."
              value={form.brand_logo_url} onChange={v => set('brand_logo_url', v)} orgId={org.id} prefix="logo" />
            <ImageUpload label="Cover photo" hint="Shown at the top of your booking page. PNG, JPG or WebP, up to 2 MB. A wide photo works best."
              value={form.cover_image_url} onChange={v => set('cover_image_url', v)} orgId={org.id} prefix="cover" />
            <div className="space-y-2">
              <Label>Brand colour</Label>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Brand colour">
                <button
                  type="button"
                  aria-pressed={form.brand_color === ''}
                  onClick={() => set('brand_color', '')}
                  className={cn(
                    'min-h-[44px] rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    form.brand_color === '' ? 'border-foreground bg-muted text-foreground' : 'border-input text-muted-foreground hover:bg-muted',
                  )}
                >
                  Default
                </button>
                {BRAND_SWATCHES.map(s => {
                  const selected = form.brand_color.toUpperCase() === s.hex.toUpperCase();
                  return (
                    <button
                      key={s.hex}
                      type="button"
                      aria-label={s.name}
                      aria-pressed={selected}
                      onClick={() => set('brand_color', s.hex.toUpperCase())}
                      style={{ backgroundColor: s.hex }}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl text-white ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected && 'ring-2 ring-foreground',
                      )}
                    >
                      {selected && <Check className="h-5 w-5" />}
                    </button>
                  );
                })}
              </div>
              {errors.brand_color && <p className="text-xs text-destructive">{errors.brand_color}</p>}
            </div>
            <Field id="tagline" label="Tagline" max={LIMITS.tagline} value={form.tagline} onChange={v => set('tagline', v)}
              error={errors.tagline} placeholder="Safe, on-time rides across the city" />
          </Section>

          <Section title="What customers see">
            <Field id="welcome_message" label="Welcome message" multiline max={LIMITS.welcome_message} value={form.welcome_message}
              onChange={v => set('welcome_message', v)} error={errors.welcome_message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="service_area" label="Service area" max={LIMITS.service_area} value={form.service_area}
                onChange={v => set('service_area', v)} error={errors.service_area} placeholder="City and nearby towns" />
              <Field id="service_hours" label="Service hours" max={LIMITS.service_hours} value={form.service_hours}
                onChange={v => set('service_hours', v)} error={errors.service_hours} placeholder="6 am to 11 pm" />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label>Highlights</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{form.highlights.length}/{MAX_HIGHLIGHTS}</span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Highlights">
                {FLEET_HIGHLIGHTS.map(h => {
                  const selected = form.highlights.includes(h.id);
                  return (
                    <Chip key={h.id} selected={selected} disabled={!selected && form.highlights.length >= MAX_HIGHLIGHTS}
                      onClick={() => toggle('highlights', h.id)}>
                      <h.icon className="h-4 w-4" /> {h.label}
                    </Chip>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Pick up to {MAX_HIGHLIGHTS}. Only promise what you deliver.</p>
              {errors.highlights && <p className="text-xs text-destructive">{errors.highlights}</p>}
            </div>
            <Field id="cancellation_note" label="Cancellation note" multiline max={LIMITS.cancellation_note} value={form.cancellation_note}
              onChange={v => set('cancellation_note', v)} error={errors.cancellation_note} />
            <Field id="thank_you_message" label="Thank-you message after a trip" multiline max={LIMITS.thank_you_message}
              value={form.thank_you_message} onChange={v => set('thank_you_message', v)} error={errors.thank_you_message} />
          </Section>

          <Section title="How customers reach you">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="support_phone" label="Support phone" inputMode="tel" value={form.support_phone}
                onChange={v => set('support_phone', v)} error={errors.support_phone} placeholder="+91 98765 43210" />
              <Field id="whatsapp_phone" label="WhatsApp number" inputMode="tel" value={form.whatsapp_phone}
                onChange={v => set('whatsapp_phone', v)} error={errors.whatsapp_phone} placeholder="+91 98765 43210" />
            </div>
          </Section>

          <Section title="Payments">
            <div className="space-y-2">
              <Label>Accepted methods</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Accepted payment methods">
                <Chip selected={form.payment_methods.includes('cash')} onClick={() => toggle('payment_methods', 'cash')}>Cash</Chip>
                <Chip selected={upiOn} onClick={() => toggle('payment_methods', 'upi')}>UPI</Chip>
              </div>
              {errors.payment_methods && <p className="text-xs text-destructive">{errors.payment_methods}</p>}
            </div>
            <Field id="upi_id" label="UPI ID" value={form.upi_id} onChange={v => set('upi_id', v)} error={errors.upi_id}
              placeholder="name@bank" />
            <ImageUpload label="UPI QR code" hint="PNG, JPG or WebP, up to 2 MB. Customers scan it to pay."
              value={form.upi_qr_url} onChange={v => set('upi_qr_url', v)} orgId={org.id} prefix="upi-qr" />
            <Field id="google_review_url" label="Google review link" inputMode="url" value={form.google_review_url}
              onChange={v => set('google_review_url', v)} error={errors.google_review_url} placeholder="https://g.page/r/..."
              hint="Customers are asked to review you after a trip." />
          </Section>

          <Section title="For your drivers" note="Only your signed-in drivers see this.">
            {driverBlocked && (
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Could not load driver notes. Reload the page to try again.
              </p>
            )}
            <Field id="driver_welcome_note" label="Welcome note" multiline max={LIMITS.driver_welcome_note} disabled={driverBlocked}
              value={form.driver_welcome_note} onChange={v => set('driver_welcome_note', v)} error={errors.driver_welcome_note} />
            <Field id="driver_rules" label="Rules" multiline max={LIMITS.driver_rules} disabled={driverBlocked}
              value={form.driver_rules} onChange={v => set('driver_rules', v)} error={errors.driver_rules} />
            <Field id="driver_office_phone" label="Office number" inputMode="tel" disabled={driverBlocked}
              value={form.driver_office_phone} onChange={v => set('driver_office_phone', v)} error={errors.driver_office_phone} />
          </Section>

          <Section title="Your links" note="Share these. They update on their own when you change settings.">
            <CopyRow label="Customer booking link" value={bookingLink} />
            <CopyRow label="Driver join code" value={org.join_code} />
            {onOpenPricing && (
              <Button type="button" variant="link" className="h-auto p-0" onClick={onOpenPricing}>
                Set your prices in Pricing
              </Button>
            )}
          </Section>
        </div>

        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-28">
            <HeaderPreview form={form} />
          </div>
        </aside>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card md:left-64">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
            <p className={cn('min-w-0 text-sm', saveError || errorCount ? 'text-destructive' : 'text-muted-foreground')} role="status">
              {saveError
                ?? (errorCount > 0 ? `Fix ${errorCount} ${errorCount === 1 ? 'field' : 'fields'} to save` : 'You have unsaved changes')}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => { setSaveError(null); setForm(baseline); }}>
                Discard
              </Button>
              <Button type="button" disabled={saving || errorCount > 0} onClick={save}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminOnly() {
  return (
    <div className="px-4 py-16 text-center md:px-8">
      <h2 className="text-lg font-bold text-foreground">Settings are for the fleet admin</h2>
      <p className="mt-2 text-sm text-muted-foreground">Sign in with the admin account to change them.</p>
    </div>
  );
}
