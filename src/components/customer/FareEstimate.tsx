import { isOutstation } from '@/lib/bookingRequest';

/** The honest note on what an estimate covers. Shared by the form's fare bar and the summary. */
export function FareNote({ tripType }: { tripType: string }) {
  return (
    <>
      <p className="text-xs text-muted-foreground">Estimate. Tolls and parking aren&apos;t included.</p>
      {isOutstation(tripType) && (
        <p className="text-xs text-muted-foreground">Extra days or distance may change the final fare.</p>
      )}
    </>
  );
}
