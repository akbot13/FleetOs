import { describe, expect, it } from 'vitest';
import { clearSavedCustomer, readSavedCustomer, saveCustomer } from './savedCustomer';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, v); },
  };
}

const blocked = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
} as unknown as Storage;

describe('savedCustomer', () => {
  it('round-trips name and phone per org', () => {
    const s = memoryStorage();
    saveCustomer('org-1', ' Asha ', '98765 43210', s);
    expect(readSavedCustomer('org-1', s)).toEqual({ name: 'Asha', phone: '9876543210' });
    expect(readSavedCustomer('org-2', s)).toBeNull();
  });
  it('stores only name and phone', () => {
    const s = memoryStorage();
    saveCustomer('org-1', 'Asha', '9876543210', s);
    expect(Object.keys(JSON.parse(s.getItem('fleetos_customer:org-1')!)).sort()).toEqual(['name', 'phone']);
  });
  it('does not save incomplete details', () => {
    const s = memoryStorage();
    saveCustomer('org-1', '', '9876543210', s);
    saveCustomer('org-1', 'Asha', '123', s);
    expect(readSavedCustomer('org-1', s)).toBeNull();
  });
  it('clears', () => {
    const s = memoryStorage();
    saveCustomer('org-1', 'Asha', '9876543210', s);
    clearSavedCustomer('org-1', s);
    expect(readSavedCustomer('org-1', s)).toBeNull();
  });
  it('ignores corrupt data', () => {
    const s = memoryStorage();
    s.setItem('fleetos_customer:org-1', '{nope');
    expect(readSavedCustomer('org-1', s)).toBeNull();
  });
  it('works with storage blocked or missing', () => {
    expect(() => saveCustomer('org-1', 'Asha', '9876543210', blocked)).not.toThrow();
    expect(readSavedCustomer('org-1', blocked)).toBeNull();
    expect(() => clearSavedCustomer('org-1', blocked)).not.toThrow();
    expect(readSavedCustomer('org-1', null)).toBeNull();
  });
});
