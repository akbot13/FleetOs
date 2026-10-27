import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Info, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  LocationSearchError,
  hasLocationSearchProvider,
  olaAutocomplete,
  olaPlaceDetails,
  type OlaPlacePrediction,
} from '@/lib/olaMaps';

interface LocationInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  icon?: 'pickup' | 'drop';
}

const PLUS_CODE_REGEX = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}(\s.+)?$/i;

export function LocationInput({ value, onChange, placeholder, icon = 'drop' }: LocationInputProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<OlaPlacePrediction[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const isPlusCode = PLUS_CODE_REGEX.test(value.trim());
  const isSearchEnabled = hasLocationSearchProvider();

  useEffect(() => {
    if (!isSearchEnabled || isPlusCode) {
      setPredictions([]);
      setSearchOpen(false);
      setSearchError(null);
      setLoading(false);
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setPredictions([]);
      setSearchOpen(false);
      setSearchError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);

      try {
        const results = await olaAutocomplete(query);
        if (requestId !== requestIdRef.current) return;
        setPredictions(results);
        setSearchOpen(results.length > 0);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        // Reached only after every provider has failed; name each one and how it failed.
        setSearchError(
          error instanceof LocationSearchError
            ? `${error.message} You can still type the full address.`
            : 'Address suggestions are unavailable right now. You can still type the full address.'
        );

        setPredictions([]);
        setSearchOpen(false);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [isPlusCode, isSearchEnabled, value]);

  const handleSelectPrediction = async (prediction: OlaPlacePrediction) => {
    setLoading(true);
    setSearchOpen(false);

    try {
      if (typeof prediction.lat === 'number' && typeof prediction.lng === 'number') {
        onChange(prediction.description);
        setSearchError(null);
        return;
      }

      const details = await olaPlaceDetails(prediction.place_id, prediction.description);
      onChange(details?.address || prediction.description);
      setSearchError(null);
    } catch {
      onChange(prediction.description);
      setSearchError('Could not pin the exact place, so the address was kept as shown.');
    } finally {
      setLoading(false);
      setPredictions([]);
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {icon === 'pickup' ? (
            <div className="h-2.5 w-2.5 rounded-full bg-success" />
          ) : (
            <MapPin className="h-3.5 w-3.5 text-destructive" />
          )}
        </div>
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (predictions.length > 0) setSearchOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setSearchOpen(false), 120);
          }}
          className="pl-9 pr-10 h-12 rounded-lg"
        />
        {loading && (
          <Loader2 className="absolute right-11 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        <Popover open={infoOpen} onOpenChange={setInfoOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center"
            >
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4 text-sm" align="end">
            <div className="flex justify-between items-start mb-2">
              <p className="font-semibold text-foreground">How to share your exact location</p>
              <button onClick={() => setInfoOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-2 text-muted-foreground text-xs">
              <p><strong className="text-foreground">Option 1</strong> — Type your address normally</p>
              <p><strong className="text-foreground">Option 2</strong> — Use a Google Plus Code</p>
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground">To get your Plus Code:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Open Google Maps</li>
                  <li>Long press your exact location</li>
                  <li>Tap the Plus Code shown at the top</li>
                  <li>Copy and paste it here</li>
                </ol>
              </div>
              <p>Plus Codes work even without a street address.</p>
              <p className="font-medium text-foreground">Example: 7JVW+XG Jaipur</p>
            </div>
          </PopoverContent>
        </Popover>

        {searchOpen && predictions.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="max-h-64 overflow-y-auto py-1.5">
              {predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    void handleSelectPrediction(prediction);
                  }}
                >
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {prediction.structured_formatting?.main_text || prediction.description}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {prediction.structured_formatting?.secondary_text || prediction.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              Search uses Ola first, then Mappls and open fallback providers
            </div>
          </div>
        )}
      </div>
      {isPlusCode && (
        <p className="text-xs text-success ml-1 flex items-center gap-1">
          <MapPin className="h-3 w-3" /> Plus Code detected
        </p>
      )}
      {!isPlusCode && searchError && (
        <p className="ml-1 text-xs text-amber-600">{searchError}</p>
      )}
    </div>
  );
}
