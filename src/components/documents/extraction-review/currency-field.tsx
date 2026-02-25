/**
 * @file Currency field with dropdown and amount input
 */
import { useState, useCallback, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CURRENCIES, getCurrency } from "@/lib/currencies";

interface CurrencyFieldProps {
  currencyCode: string | null;
  amount: number | null;
  onCurrencyChange?: (code: string | null) => void;
  onAmountChange?: (amount: number | null) => void;
  readOnly?: boolean;
}

export function CurrencyField({
  currencyCode,
  amount,
  onCurrencyChange,
  onAmountChange,
  readOnly = false,
}: CurrencyFieldProps) {
  // Local amount for controlled input (commit on blur)
  const [localAmount, setLocalAmount] = useState<string>(
    amount !== null ? String(amount) : ""
  );
  useEffect(() => {
    setLocalAmount(amount !== null ? String(amount) : "");
  }, [amount]);

  const selectedCurrency = getCurrency(currencyCode);

  const handleAmountBlur = useCallback(() => {
    if (!onAmountChange) return;
    // Empty string -> null
    if (localAmount.trim() === "") {
      if (amount !== null) onAmountChange(null);
      return;
    }
    const parsed = parseFloat(localAmount);
    if (!Number.isNaN(parsed) && parsed !== amount) {
      onAmountChange(parsed);
    }
  }, [localAmount, amount, onAmountChange]);

  if (readOnly) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-2.5 py-2 bg-muted/30 rounded-md text-sm w-[120px] border border-border/30">
          {selectedCurrency ? `${selectedCurrency.symbol} ${selectedCurrency.code}` : "NULL"}
        </div>
        <div className="flex-1 px-3 py-2 bg-muted/30 rounded-md text-sm border border-border/30">
          {amount !== null ? amount.toLocaleString() : "NULL"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currencyCode ?? "__null__"}
        onValueChange={(code) => onCurrencyChange?.(code === "__null__" ? null : code)}
      >
        <SelectTrigger className="w-[120px] text-sm">
          <SelectValue placeholder="NULL" />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          <SelectItem value="__null__" className="text-sm text-muted-foreground">
            NULL
          </SelectItem>
          {CURRENCIES.map((currency) => (
            <SelectItem key={currency.code} value={currency.code} className="text-sm">
              <span className="w-7 shrink-0 inline-block">{currency.symbol}</span>
              <span className="w-10 shrink-0 inline-block">{currency.code}</span>
              <span className="text-muted-foreground">{currency.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        value={localAmount}
        onChange={(e) => setLocalAmount(e.target.value)}
        onBlur={handleAmountBlur}
        placeholder="NULL"
        className="flex-1 placeholder:text-foreground"
        step="0.01"
      />
    </div>
  );
}
