import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

const columns = [
  { header: 'Name', value: (r: { name: string | null; fare: number | null }) => r.name },
  { header: 'Fare', value: (r: { name: string | null; fare: number | null }) => r.fare },
];

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv([{ name: 'Sharma, "Raj"\nJr', fare: 450 }], columns))
      .toBe('Name,Fare\r\n"Sharma, ""Raj""\nJr",450');
  });

  it('leaves empty cells for missing values', () => {
    expect(toCsv([{ name: null, fare: null }], columns)).toBe('Name,Fare\r\n,');
  });

  it("stops typed text from running as a formula, but keeps negative numbers", () => {
    expect(toCsv([{ name: '=HYPERLINK("x")', fare: -20 }], columns)).toBe(`Name,Fare\r\n"'=HYPERLINK(""x"")",-20`);
    expect(toCsv([{ name: '@SUM(A1)', fare: 0 }], columns)).toBe("Name,Fare\r\n'@SUM(A1),0");
    expect(toCsv([{ name: '-15', fare: 1 }], columns)).toBe('Name,Fare\r\n-15,1');
  });
});
