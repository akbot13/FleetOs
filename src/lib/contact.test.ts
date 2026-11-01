import { describe, it, expect } from 'vitest';
import { dialDigits, telHref, whatsappHref } from './contact';

describe('dialDigits', () => {
  it('adds 91 to a 10-digit number', () => {
    expect(dialDigits('98765 43210')).toBe('919876543210');
  });
  it('keeps an existing country code', () => {
    expect(dialDigits('+91 98765-43210')).toBe('919876543210');
    expect(dialDigits('919876543210')).toBe('919876543210');
    expect(dialDigits('+44 20 7946 0958')).toBe('442079460958');
  });
  it('drops a leading trunk zero', () => {
    expect(dialDigits('09876543210')).toBe('919876543210');
    expect(dialDigits('0091 9876543210')).toBe('919876543210');
  });
  it('rejects blank, short and absurd numbers', () => {
    expect(dialDigits(null)).toBeNull();
    expect(dialDigits('   ')).toBeNull();
    expect(dialDigits('12345')).toBeNull();
    expect(dialDigits('1234567890123456')).toBeNull();
  });
});

describe('links', () => {
  it('builds tel and wa.me links', () => {
    expect(telHref('9876543210')).toBe('tel:+919876543210');
    expect(whatsappHref('+91 98765 43210')).toBe('https://wa.me/919876543210');
  });
  it('returns null when there is no number', () => {
    expect(telHref('')).toBeNull();
    expect(whatsappHref(undefined)).toBeNull();
  });
});
