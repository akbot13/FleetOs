// Name and phone kept on this device so repeat customers don't retype them. Stored per fleet.
// Addresses and notes are never saved. Storage can be blocked, so every call is guarded.

export interface SavedCustomer {
  name: string;
  phone: string;
}

const keyFor = (orgId: string) => `fleetos_customer:${orgId}`;

function deviceStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSavedCustomer(
  orgId: string | null | undefined,
  storage: Storage | null = deviceStorage(),
): SavedCustomer | null {
  if (!orgId || !storage) return null;
  try {
    const raw = storage.getItem(keyFor(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCustomer> | null;
    const name = typeof parsed?.name === 'string' ? parsed.name.trim().slice(0, 80) : '';
    const phone = typeof parsed?.phone === 'string' ? parsed.phone.replace(/\D/g, '') : '';
    if (!name || phone.length !== 10) return null;
    return { name, phone };
  } catch {
    return null;
  }
}

export function saveCustomer(
  orgId: string | null | undefined,
  name: string,
  phone: string,
  storage: Storage | null = deviceStorage(),
): void {
  const cleanName = name.trim().slice(0, 80);
  const cleanPhone = phone.replace(/\D/g, '');
  if (!orgId || !storage || !cleanName || cleanPhone.length !== 10) return;
  try {
    storage.setItem(keyFor(orgId), JSON.stringify({ name: cleanName, phone: cleanPhone }));
  } catch {
    // Blocked storage: the booking still works without it.
  }
}

export function clearSavedCustomer(
  orgId: string | null | undefined,
  storage: Storage | null = deviceStorage(),
): void {
  if (!orgId || !storage) return;
  try {
    storage.removeItem(keyFor(orgId));
  } catch {
    // Nothing to clear.
  }
}
