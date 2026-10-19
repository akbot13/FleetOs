import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeAppView, hasApprovedDriverSession } from './viewAccess';

describe('normalizeAppView', () => {
  it('passes through valid views', () => {
    expect(normalizeAppView('admin')).toBe('admin');
    expect(normalizeAppView('driver')).toBe('driver');
    expect(normalizeAppView('pricing')).toBe('pricing');
  });

  it('falls back to customer for empty or unknown values', () => {
    expect(normalizeAppView(null)).toBe('customer');
    expect(normalizeAppView('')).toBe('customer');
    expect(normalizeAppView('foo')).toBe('customer');
  });
});

describe('hasApprovedDriverSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns true for a free driver on the app screen', () => {
    sessionStorage.setItem('fleetos_driver', JSON.stringify({ status: 'free' }));
    sessionStorage.setItem('fleetos_driver_screen', 'app');
    expect(hasApprovedDriverSession()).toBe(true);
  });

  it('returns false when the driver is pending', () => {
    sessionStorage.setItem('fleetos_driver', JSON.stringify({ status: 'pending' }));
    sessionStorage.setItem('fleetos_driver_screen', 'app');
    expect(hasApprovedDriverSession()).toBe(false);
  });

  it('returns false for invalid JSON', () => {
    sessionStorage.setItem('fleetos_driver', '{not json');
    sessionStorage.setItem('fleetos_driver_screen', 'app');
    expect(hasApprovedDriverSession()).toBe(false);
  });

  it('returns false when keys are missing', () => {
    expect(hasApprovedDriverSession()).toBe(false);
    sessionStorage.setItem('fleetos_driver', JSON.stringify({ status: 'free' }));
    expect(hasApprovedDriverSession()).toBe(false);
  });
});
