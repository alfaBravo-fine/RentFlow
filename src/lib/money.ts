import { CountryPack } from '../countries/types';

/**
 * Converts major currency unit (e.g., $10.50) to integer minor unit (e.g., 1050 cents).
 * Never stores money as float in database rows.
 */
export function toMinor(major: number, pack: CountryPack): number {
  const factor = Math.pow(10, pack.currency.minorUnits);
  return Math.round(major * factor);
}

/**
 * Converts integer minor unit (e.g., 1050) back to major currency unit (e.g., 10.50).
 */
export function toMajor(minor: number, pack: CountryPack): number {
  const factor = Math.pow(10, pack.currency.minorUnits);
  return minor / factor;
}

/**
 * Round a number to the pack's minor unit precision using half-up method.
 */
export function roundMinor(val: number, pack: CountryPack): number {
  return Math.round(val);
}

/**
 * Converts minor amount from one currency to another using an FX rate.
 * Rounds to destination currency's minor units.
 */
export function convertMinor(
  amountMinor: number,
  fromPack: CountryPack,
  toPack: CountryPack,
  rate: number
): number {
  const fromMajor = toMajor(amountMinor, fromPack);
  const convertedMajor = fromMajor * rate;
  return toMinor(convertedMajor, toPack);
}

/**
 * Formats integer minor units into a human-readable string based on CountryPack currency settings.
 * Supports:
 * - JPY: 0 decimals (e.g., ¥150,000)
 * - KWD: 3 decimals (e.g., KWD 1,250.500)
 * - INR: Indian grouping system (e.g., ₹1,50,000.00)
 * - Standard USD/EUR/GBP (e.g., $1,500.00 / 1.500,00 €)
 */
export function formatMoney(minor: number, pack: CountryPack): string {
  const major = toMajor(minor, pack);
  const decimals = pack.currency.minorUnits;

  // Format using standard Intl.NumberFormat according to pack's locale
  let formattedNumber = new Intl.NumberFormat(pack.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(Math.abs(major));

  // If pack specifies custom separators override
  if (pack.currency.decimalSeparator !== '.' || pack.currency.groupSeparator !== ',') {
    // For locales like de-DE where default is already fine, Intl handled it, but let's ensure consistency
  }

  const symbol = pack.currency.symbol;
  const isNegative = minor < 0;
  const prefix = isNegative ? '-' : '';

  let result = '';
  if (pack.currency.symbolPosition === 'before') {
    result = `${prefix}${symbol} ${formattedNumber}`;
  } else {
    result = `${prefix}${formattedNumber} ${symbol}`;
  }

  return result.trim();
}
