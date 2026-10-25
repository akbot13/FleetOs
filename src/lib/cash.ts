// A driver's money for the day. Only cash (not UPI) goes into the office handover, and the
// driver's spending comes out of that cash.
export interface CashLine {
  amount: number;
}

export function summarizeCash(
  expenses: CashLine[],
  collections: (CashLine & { method: 'cash' | 'upi' })[],
) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalExpenses = round(expenses.reduce((s, e) => s + e.amount, 0));
  const totalCollected = round(collections.reduce((s, c) => s + c.amount, 0));
  const totalCashCollected = round(collections.filter(c => c.method === 'cash').reduce((s, c) => s + c.amount, 0));
  return {
    totalExpenses,
    totalCollected,
    totalCashCollected,
    cashToHandOver: round(totalCashCollected - totalExpenses),
    netEarnings: round(totalCollected - totalExpenses),
  };
}

// "-₹1" for a loss, "₹1" otherwise.
export const formatSignedRupees = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;
