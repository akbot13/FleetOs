import { describe, it, expect } from 'vitest';
import { acceptedPayments, firstName, greetingForHour, monogram, pickPayment, textHash } from './fleetDisplay';
import { dismissDriverNote, driverNoteHash, hasDriverNote, isDriverNoteDismissed } from './driverNote';

describe('monogram', () => {
  it('uses two initials for two words and first two letters for one', () => {
    expect(monogram('Anil Cabs')).toBe('AC');
    expect(monogram('  jaipur  city  taxi ')).toBe('JC');
    expect(monogram('Zoom')).toBe('ZO');
  });
  it('is empty for a blank name', () => {
    expect(monogram('')).toBe('');
    expect(monogram(null)).toBe('');
  });
});

describe('greeting and names', () => {
  it('picks the greeting by hour', () => {
    expect(greetingForHour(5)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
  it('takes the first name', () => {
    expect(firstName('Ramesh Kumar')).toBe('Ramesh');
    expect(firstName('  ')).toBe('');
    expect(firstName(undefined)).toBe('');
  });
});

describe('payments', () => {
  it('keeps accepted methods in fixed order and drops unknown ones', () => {
    expect(acceptedPayments(['upi', 'cash'])).toEqual(['cash', 'upi']);
    expect(acceptedPayments(['upi', 'card'])).toEqual(['upi']);
  });
  it('falls back to cash when nothing valid is set', () => {
    expect(acceptedPayments([])).toEqual(['cash']);
    expect(acceptedPayments(null)).toEqual(['cash']);
  });
  it('preselects a valid method', () => {
    expect(pickPayment(['upi'], 'cash')).toBe('upi');
    expect(pickPayment(['cash', 'upi'], 'upi')).toBe('upi');
    expect(pickPayment(['cash', 'upi'])).toBe('cash');
  });
});

describe('driver note memory', () => {
  const memory = () => {
    const data: Record<string, string> = {};
    return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
  };

  it('hashes differ when content differs and ignore outer whitespace', () => {
    expect(textHash('a', 'b')).toBe(textHash(' a ', 'b'));
    expect(textHash('a', 'b')).not.toBe(textHash('ab', ''));
  });
  it('knows whether there is anything to show', () => {
    expect(hasDriverNote(' ', null)).toBe(false);
    expect(hasDriverNote('Welcome', null)).toBe(true);
    expect(hasDriverNote(null, 'No smoking')).toBe(true);
  });
  it('stays dismissed until the content changes', () => {
    const store = memory();
    const h1 = driverNoteHash('Welcome', 'Be on time');
    expect(isDriverNoteDismissed(h1, store)).toBe(false);
    dismissDriverNote(h1, store);
    expect(isDriverNoteDismissed(h1, store)).toBe(true);
    expect(isDriverNoteDismissed(driverNoteHash('Welcome', 'Be early'), store)).toBe(false);
  });
  it('survives broken storage', () => {
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(isDriverNoteDismissed('x', broken)).toBe(false);
    expect(() => dismissDriverNote('x', broken)).not.toThrow();
  });
});
