/**
 * @file ISO 4217 currency data for currency picker
 * @description Curated list of ~30 popular currencies focused on Asia and Europe
 */

/**
 * Currency item for combobox display.
 */
export interface CurrencyItem {
  /** ISO 4217 code (e.g., "SGD") */
  code: string;
  /** Currency name (e.g., "Singapore Dollar") */
  name: string;
  /** Currency symbol (e.g., "S$") */
  symbol: string;
  /** Display label for combobox (e.g., "S$ SGD - Singapore Dollar") */
  label: string;
}

/**
 * Curated list of ~30 popular currencies.
 * Priority: Asia > Europe > Major global currencies
 */
export const CURRENCIES: CurrencyItem[] = [
  // === ASIA (Primary Focus) ===
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", label: "S$ SGD - Singapore Dollar" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", label: "¥ JPY - Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", label: "¥ CNY - Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", label: "HK$ HKD - Hong Kong Dollar" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", label: "RM MYR - Malaysian Ringgit" },
  { code: "THB", name: "Thai Baht", symbol: "฿", label: "฿ THB - Thai Baht" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", label: "₹ INR - Indian Rupee" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", label: "Rp IDR - Indonesian Rupiah" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", label: "₱ PHP - Philippine Peso" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", label: "₫ VND - Vietnamese Dong" },
  { code: "KRW", name: "South Korean Won", symbol: "₩", label: "₩ KRW - South Korean Won" },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", label: "NT$ TWD - New Taiwan Dollar" },

  // === EUROPE ===
  { code: "EUR", name: "Euro", symbol: "€", label: "€ EUR - Euro" },
  { code: "GBP", name: "British Pound", symbol: "£", label: "£ GBP - British Pound" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr", label: "Fr CHF - Swiss Franc" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", label: "kr SEK - Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", label: "kr NOK - Norwegian Krone" },
  { code: "DKK", name: "Danish Krone", symbol: "kr", label: "kr DKK - Danish Krone" },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", label: "zł PLN - Polish Złoty" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", label: "Kč CZK - Czech Koruna" },

  // === GLOBAL MAJOR ===
  { code: "USD", name: "US Dollar", symbol: "$", label: "$ USD - US Dollar" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", label: "C$ CAD - Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", label: "A$ AUD - Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", label: "NZ$ NZD - New Zealand Dollar" },

  // === MIDDLE EAST ===
  { code: "AED", name: "UAE Dirham", symbol: "AED", label: "AED AED - UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", label: "SAR SAR - Saudi Riyal" },

  // === AFRICA & SOUTH AMERICA (Main only) ===
  { code: "ZAR", name: "South African Rand", symbol: "R", label: "R ZAR - South African Rand" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", label: "₦ NGN - Nigerian Naira" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", label: "R$ BRL - Brazilian Real" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", label: "MX$ MXN - Mexican Peso" },
];

/**
 * Map of currency code to currency item for quick lookup.
 */
export const CURRENCY_MAP: Map<string, CurrencyItem> = new Map(
  CURRENCIES.map((c) => [c.code, c])
);

/**
 * Get currency item by code.
 * @param code - ISO 4217 currency code
 * @returns Currency item or undefined if not found
 */
export function getCurrency(code: string | null): CurrencyItem | undefined {
  if (!code) return undefined;
  return CURRENCY_MAP.get(code.toUpperCase());
}

/**
 * Get currency symbol by code.
 * @param code - ISO 4217 currency code
 * @returns Symbol string or the code itself if no symbol defined
 */
export function getCurrencySymbol(code: string | null): string {
  if (!code) return "";
  const currency = CURRENCY_MAP.get(code.toUpperCase());
  return currency?.symbol ?? code;
}
