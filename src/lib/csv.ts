// CSV files that open cleanly in Excel and Google Sheets.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

// Customer names and addresses are typed by the public. A cell starting with = + - @ would run
// as a formula when the file is opened in Excel, so such text gets a leading apostrophe.
// Plain numbers (including negative ones) are left alone.
function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map(c => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map(c => cell(c.value(row))).join(','));
  return lines.join('\r\n');
}

// Saves the CSV as a file. The byte-order mark makes Excel read ₹ and Hindi text correctly.
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
