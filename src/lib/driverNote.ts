import { textHash } from './fleetDisplay';

// The driver's "From <fleet>" block collapses after they dismiss it, and opens again when the owner
// changes the note or rules. The fingerprint of what they dismissed is kept in localStorage.

const KEY = 'fleetos_driver_note_seen';

export function driverNoteHash(note: string | null | undefined, rules: string | null | undefined): string {
  return textHash(note, rules);
}

export function hasDriverNote(note: string | null | undefined, rules: string | null | undefined): boolean {
  return !!(note?.trim() || rules?.trim());
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** True when the driver already dismissed exactly this content. Storage problems count as not seen. */
export function isDriverNoteDismissed(hash: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(KEY) === hash;
  } catch {
    return false;
  }
}

export function dismissDriverNote(hash: string, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, hash);
  } catch {
    // Private mode or full storage: the note simply opens again next time.
  }
}
