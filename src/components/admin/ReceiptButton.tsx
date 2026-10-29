import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/hooks/useOrg';
import { openReceipt, type ReceiptBooking } from '@/lib/receipt';

// Opens a printable receipt for the booking in a new tab.
export function ReceiptButton({ booking }: { booking: ReceiptBooking }) {
  const { org } = useOrg();
  return (
    <Button
      size="sm"
      variant="outline"
      className="flex-1 rounded-lg text-xs"
      onClick={() => {
        const opened = openReceipt(booking, { name: org?.brand_name || org?.name || 'Receipt', upi_id: org?.upi_id });
        if (!opened) toast.error('The browser blocked the receipt tab. Allow pop-ups for this site and try again.');
      }}
    >
      <Receipt className="h-3 w-3 mr-1" />Receipt
    </Button>
  );
}
